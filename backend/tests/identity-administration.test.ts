import request from "supertest";
import { Wallet } from "ethers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { clearChallengeStore } from "../src/services/auth/challengeStore.js";
import { clearAuditEvents } from "../src/services/audit/audit.service.js";
import { clearAuthorizationState } from "../src/services/authorization/authorization.service.js";
import { clearDeviceStore } from "../src/services/device.service.js";
import {
  assignRole,
  clearIdentityStore,
  getIdentityByWallet,
  registerIdentity,
  updateIdentityStatus,
} from "../src/services/identity.service.js";
import { clearSessionStore } from "../src/services/session.service.js";

async function authenticate(app: ReturnType<typeof createApp>, role: string, existingWallet = Wallet.createRandom()) {
  const wallet = existingWallet;
  const identity = getIdentityByWallet(wallet.address) ?? registerIdentity(wallet.address, role);
  assignRole(identity.identityId, role);
  const challenge = await request(app).post("/api/auth/challenge").send({ walletAddress: wallet.address });
  const message = challenge.body.challenge.message as string;
  const signature = await wallet.signMessage(message);
  const verified = await request(app).post("/api/auth/verify").send({
    walletAddress: wallet.address,
    message,
    signature,
  });
  return {
    identity,
    accessToken: verified.body.result.session.accessToken as string,
  };
}

describe("identity administration security boundary", () => {
  beforeEach(() => {
    clearChallengeStore();
    clearAuditEvents();
    clearAuthorizationState();
    clearDeviceStore();
    clearIdentityStore();
    clearSessionStore();
  });

  it("requires policies:manage for identity creation and does not expose wallet lookup publicly", async () => {
    const app = createApp();
    const wallet = Wallet.createRandom();
    const publicCreate = await request(app).post("/api/identities").send({
      walletAddress: wallet.address,
      displayName: "Untrusted",
    });
    expect(publicCreate.status).toBe(401);
    expect(publicCreate.body.error.code).toBe("SESSION_MISSING");

    const publicLookup = await request(app).get(`/api/identities/wallet/${wallet.address}`);
    expect(publicLookup.status).toBe(401);
    expect(publicLookup.body.error.code).toBe("SESSION_MISSING");
  });

  it("denies ordinary users and prevents an administrator from changing their own roles", async () => {
    const app = createApp();
    const employee = await authenticate(app, "employee");
    const denied = await request(app)
      .post("/api/identities")
      .set("Authorization", `Bearer ${employee.accessToken}`)
      .send({ walletAddress: Wallet.createRandom().address, displayName: "Target" });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("AUTHORIZATION_DENIED");

    const admin = await authenticate(app, "admin");
    const selfRoleChange = await request(app)
      .patch(`/api/identities/${admin.identity.identityId}/roles`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ role: "manager" });
    expect(selfRoleChange.status).toBe(403);
    expect(selfRoleChange.body.error.code).toBe("IDENTITY_SELF_ROLE_CHANGE");
  });

  it("supports lifecycle and role administration, invalidates sessions on revoke, and blocks re-authentication", async () => {
    const app = createApp();
    const admin = await authenticate(app, "admin");
    const targetWallet = Wallet.createRandom();
    const created = await request(app)
      .post("/api/identities")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ walletAddress: targetWallet.address, displayName: "Target User" });
    expect(created.status).toBe(201);
    const identityId = created.body.identity.identityId as string;

    const updated = await request(app)
      .patch(`/api/identities/${identityId}/profile`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ displayName: "Updated Target" });
    expect(updated.status).toBe(200);
    expect(updated.body.identity.displayName).toBe("Updated Target");

    const assigned = await request(app)
      .patch(`/api/identities/${identityId}/roles`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ role: "manager" });
    expect(assigned.status).toBe(200);
    expect(assigned.body.identity.roles).toContain("manager");

    const target = await authenticate(app, "manager", targetWallet);
    expect(target.identity.identityId).toBe(identityId);

    const removed = await request(app)
      .delete(`/api/identities/${identityId}/roles`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ role: "manager" });
    expect(removed.status).toBe(200);
    expect(removed.body.identity.roles).not.toContain("manager");

    const revoked = await request(app)
      .patch(`/api/identities/${identityId}/status`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "REVOKED" });
    expect(revoked.status).toBe(200);

    const targetSession = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${target.accessToken}`);
    expect(targetSession.status).toBe(401);

    const challenge = await request(app).post("/api/auth/challenge").send({ walletAddress: targetWallet.address });
    const message = challenge.body.challenge.message as string;
    const signature = await targetWallet.signMessage(message);
    const reauth = await request(app).post("/api/auth/verify").send({
      walletAddress: targetWallet.address,
      message,
      signature,
    });
    expect(reauth.status).toBe(403);
    expect(reauth.body.error.code).toBe("AUTH_IDENTITY_REVOKED");
  });

  it("supports server-side identity search and status filters", async () => {
    const app = createApp();
    const admin = await authenticate(app, "admin");
    registerIdentity(Wallet.createRandom().address, "Active Analyst");
    const revoked = registerIdentity(Wallet.createRandom().address, "Revoked Analyst");
    updateIdentityStatus(revoked.identityId, "REVOKED");

    const response = await request(app)
      .get("/api/identities?search=analyst&status=REVOKED")
      .set("Authorization", `Bearer ${admin.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.identities).toHaveLength(1);
    expect(response.body.identities[0].displayName).toBe("Revoked Analyst");
  });
});

import request from "supertest";
import { Wallet } from "ethers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { clearChallengeStore } from "../src/services/auth/challengeStore.js";
import { clearAuditEvents } from "../src/services/audit/audit.service.js";
import { clearDeviceStore } from "../src/services/device.service.js";
import { clearIdentityStore, assignRole, registerIdentity } from "../src/services/identity.service.js";
import { clearSessionStore } from "../src/services/session.service.js";
import { clearAuthorizationState } from "../src/services/authorization/authorization.service.js";

async function login(app: ReturnType<typeof createApp>, role = "admin") {
  const wallet = Wallet.createRandom();
  const identity = registerIdentity(wallet.address, role);
  assignRole(identity.identityId, role);
  const challenge = await request(app).post("/api/auth/challenge").send({ walletAddress: wallet.address });
  const message = challenge.body.challenge.message as string;
  const signature = await wallet.signMessage(message);
  const verified = await request(app).post("/api/auth/verify").send({ walletAddress: wallet.address, message, signature });
  const accessToken = verified.body.result.session.accessToken as string;
  await request(app).post("/api/devices").set("Authorization", `Bearer ${accessToken}`).send({
    name: "Primary device",
    fingerprint: `${role}-primary-fingerprint`,
  });
  return { accessToken, identity };
}

describe("additional independent features", () => {
  beforeEach(() => {
    clearChallengeStore();
    clearAuditEvents();
    clearDeviceStore();
    clearIdentityStore();
    clearSessionStore();
    clearAuthorizationState();
  });

  it("returns the current session and identity", async () => {
    const app = createApp();
    const { accessToken, identity } = await login(app);
    const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.identity.identityId).toBe(identity.identityId);
    expect(response.body.session.deviceId).toEqual(expect.any(String));
  });

  it("revokes all sessions for the current identity", async () => {
    const app = createApp();
    const { accessToken } = await login(app);
    const response = await request(app).post("/api/auth/sessions/revoke-all").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.revokedCount).toBe(1);

    const currentResponse = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(currentResponse.status).toBe(401);
  });

  it("updates device last-seen time through a heartbeat", async () => {
    const app = createApp();
    const { accessToken } = await login(app);
    const devices = await request(app).get("/api/devices").set("Authorization", `Bearer ${accessToken}`);
    const deviceId = devices.body.devices[0].deviceId as string;

    const response = await request(app)
      .post(`/api/devices/${deviceId}/heartbeat`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.device.lastSeenAt).toEqual(expect.any(String));
  });

  it("allows an admin to assign and remove an identity role", async () => {
    const app = createApp();
    const { accessToken } = await login(app);
    const target = registerIdentity(Wallet.createRandom().address, "Target User");

    const assignResponse = await request(app)
      .patch(`/api/identities/${target.identityId}/roles`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ role: "manager" });
    expect(assignResponse.status).toBe(200);
    expect(assignResponse.body.identity.roles).toContain("manager");

    const removeResponse = await request(app)
      .delete(`/api/identities/${target.identityId}/roles`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ role: "manager" });
    expect(removeResponse.status).toBe(200);
    expect(removeResponse.body.identity.roles).not.toContain("manager");
  });

  it("filters and paginates protected audit events", async () => {
    const app = createApp();
    const { accessToken } = await login(app);
    await request(app).get("/api/resources/employee").set("Authorization", `Bearer ${accessToken}`);

    const response = await request(app)
      .get("/api/audit?eventType=ACCESS_DECISION&outcome=ALLOWED&limit=1&offset=0")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0]).toMatchObject({ eventType: "ACCESS_DECISION", outcome: "ALLOWED" });
  });
});
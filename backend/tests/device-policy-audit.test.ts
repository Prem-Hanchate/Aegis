import request from "supertest";
import { Wallet } from "ethers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { clearChallengeStore } from "../src/services/auth/challengeStore.js";
import { clearAuditEvents } from "../src/services/audit/audit.service.js";
import { clearDeviceStore } from "../src/services/device.service.js";
import { assignRole, clearIdentityStore, registerIdentity } from "../src/services/identity.service.js";
import { clearSessionStore } from "../src/services/session.service.js";
import { clearAuthorizationState } from "../src/services/authorization/authorization.service.js";

async function loginWithRole(app: ReturnType<typeof createApp>, role: string) {
  const wallet = Wallet.createRandom();
  const identity = registerIdentity(wallet.address, role);
  assignRole(identity.identityId, role);
  const challenge = await request(app).post("/api/auth/challenge").send({ walletAddress: wallet.address });
  const message = challenge.body.challenge.message as string;
  const signature = await wallet.signMessage(message);
  const verified = await request(app).post("/api/auth/verify").send({
    walletAddress: wallet.address,
    message,
    signature,
  });
  const accessToken = verified.body.result.session.accessToken as string;
  await request(app).post("/api/devices").set("Authorization", `Bearer ${accessToken}`).send({
    name: `${role} device`,
    fingerprint: `${role}-fingerprint-1234`,
  });
  return accessToken;
}

describe("device, policy, and audit features", () => {
  beforeEach(() => {
    clearChallengeStore();
    clearIdentityStore();
    clearSessionStore();
    clearDeviceStore();
    clearAuditEvents();
    clearAuthorizationState();
  });

  it("revokes a device and denies its protected resource access", async () => {
    const app = createApp();
    const accessToken = await loginWithRole(app, "employee");
    const devicesResponse = await request(app).get("/api/devices").set("Authorization", `Bearer ${accessToken}`);
    const deviceId = devicesResponse.body.devices[0].deviceId as string;

    const revokeResponse = await request(app)
      .patch(`/api/devices/${deviceId}/revoke`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(revokeResponse.status).toBe(200);

    const resourceResponse = await request(app)
      .get("/api/resources/employee")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(resourceResponse.status).toBe(403);
    expect(resourceResponse.body.error.code).toBe("DEVICE_REVOKED");
  });

  it("allows an admin to grant a new role permission", async () => {
    const app = createApp();
    const adminToken = await loginWithRole(app, "admin");

    const grantResponse = await request(app).post("/api/policies/permissions").set("Authorization", `Bearer ${adminToken}`).send({
      role: "contractor",
      resource: "reports",
      action: "read",
    });
    expect(grantResponse.status).toBe(201);
    expect(grantResponse.body.policy.permissions).toContain("reports:read");
  });

  it("protects audit retrieval with the policy-management permission", async () => {
    const app = createApp();
    const employeeToken = await loginWithRole(app, "employee");
    const deniedResponse = await request(app).get("/api/audit").set("Authorization", `Bearer ${employeeToken}`);
    expect(deniedResponse.status).toBe(403);

    const adminToken = await loginWithRole(app, "admin");
    const allowedResponse = await request(app).get("/api/audit").set("Authorization", `Bearer ${adminToken}`);
    expect(allowedResponse.status).toBe(200);
    expect(Array.isArray(allowedResponse.body.events)).toBe(true);
  });
});
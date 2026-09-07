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

async function loginWithDevice(app: ReturnType<typeof createApp>, role = "admin") {
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
    name: "Test device",
    fingerprint: `${role}-independent-feature-fingerprint`,
  });
  return { accessToken, identity };
}

describe("independent feature additions", () => {
  beforeEach(() => {
    clearChallengeStore();
    clearAuditEvents();
    clearDeviceStore();
    clearIdentityStore();
    clearSessionStore();
    clearAuthorizationState();
  });

  it("reports not_ready when the app process has not connected to MongoDB", async () => {
    const response = await request(createApp()).get("/api/health/ready");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("not_ready");
  });

  it("looks up an identity by wallet and updates its profile", async () => {
    const wallet = Wallet.createRandom();
    const identity = registerIdentity(wallet.address, "Original Name");
    const app = createApp();

    const lookupResponse = await request(app).get(`/api/identities/wallet/${wallet.address}`);
    expect(lookupResponse.status).toBe(200);
    expect(lookupResponse.body.identity.identityId).toBe(identity.identityId);

    const updateResponse = await request(app).patch(`/api/identities/${identity.identityId}/profile`).send({
      displayName: "Updated Name",
    });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.identity.displayName).toBe("Updated Name");
  });

  it("returns an admin-protected audit summary", async () => {
    const app = createApp();
    const { accessToken } = await loginWithDevice(app);
    await request(app).get("/api/resources/employee").set("Authorization", `Bearer ${accessToken}`);

    const response = await request(app).get("/api/audit/summary").set("Authorization", `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.summary.total).toBeGreaterThanOrEqual(1);
    expect(response.body.summary.byOutcome.ALLOWED).toBeGreaterThanOrEqual(1);
  });

  it("filters devices by status and last-seen time", async () => {
    const app = createApp();
    const { accessToken } = await loginWithDevice(app);
    const response = await request(app)
      .get(`/api/devices?status=ACTIVE&seenSince=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.devices).toHaveLength(1);
    expect(response.body.devices[0].status).toBe("ACTIVE");
  });

  it("rejects invalid device filter values", async () => {
    const app = createApp();
    const { accessToken } = await loginWithDevice(app);
    const response = await request(app)
      .get("/api/devices?status=UNKNOWN")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("DEVICE_INVALID_STATUS");
  });
});
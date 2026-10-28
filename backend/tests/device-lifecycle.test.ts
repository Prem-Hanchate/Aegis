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

async function createAuthenticatedUser(app: ReturnType<typeof createApp>, role = "employee", name = "Test User") {
  const wallet = Wallet.createRandom();
  const identity = registerIdentity(wallet.address, name);
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
  const sessionId = verified.body.result.session.sessionId as string;

  return { identity, wallet, accessToken, sessionId };
}

describe("Device Lifecycle, Ownership & Security Boundary", () => {
  beforeEach(() => {
    clearChallengeStore();
    clearIdentityStore();
    clearSessionStore();
    clearDeviceStore();
    clearAuditEvents();
    clearAuthorizationState();
  });

  it("lists devices scoped strictly to the authenticated identity", async () => {
    const app = createApp();
    const userA = await createAuthenticatedUser(app, "employee", "User A");
    const userB = await createAuthenticatedUser(app, "employee", "User B");

    // User A enrolls a device
    await request(app)
      .post("/api/devices")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ name: "User A Laptop", fingerprint: "fingerprint-user-a-12345" });

    // User B enrolls a device
    await request(app)
      .post("/api/devices")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ name: "User B Mobile", fingerprint: "fingerprint-user-b-12345" });

    // User A lists devices -> only sees User A's device
    const listA = await request(app).get("/api/devices").set("Authorization", `Bearer ${userA.accessToken}`);
    expect(listA.status).toBe(200);
    expect(listA.body.devices).toHaveLength(1);
    expect(listA.body.devices[0].name).toBe("User A Laptop");
    expect(listA.body.devices[0].identityId).toBe(userA.identity.identityId);

    // User B lists devices -> only sees User B's device
    const listB = await request(app).get("/api/devices").set("Authorization", `Bearer ${userB.accessToken}`);
    expect(listB.status).toBe(200);
    expect(listB.body.devices).toHaveLength(1);
    expect(listB.body.devices[0].name).toBe("User B Mobile");
    expect(listB.body.devices[0].identityId).toBe(userB.identity.identityId);
  });

  it("enrolls a device, auto-binds to active session, and validates inputs", async () => {
    const app = createApp();
    const user = await createAuthenticatedUser(app);

    // Validation failure: fingerprint too short (< 8 chars)
    const shortFp = await request(app)
      .post("/api/devices")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ name: "Laptop", fingerprint: "123" });
    expect(shortFp.status).toBe(400);

    // Validation failure: missing name
    const missingName = await request(app)
      .post("/api/devices")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ name: "", fingerprint: "valid-fingerprint-123" });
    expect(missingName.status).toBe(400);

    // Valid enrollment
    const enrolled = await request(app)
      .post("/api/devices")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ name: "Primary Laptop", fingerprint: "valid-fingerprint-123" });
    expect(enrolled.status).toBe(201);
    expect(enrolled.body.device.status).toBe("ACTIVE");

    // Session introspection confirms device is bound to session
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${user.accessToken}`);
    expect(me.body.session.deviceId).toBe(enrolled.body.device.deviceId);
  });

  it("denies access to protected resources when no device is bound to session", async () => {
    const app = createApp();
    const user = await createAuthenticatedUser(app, "employee");

    // User is authenticated but hasn't enrolled any device yet
    const response = await request(app)
      .get("/api/resources/employee")
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("DEVICE_REQUIRED");
  });

  it("binds an existing active device to a session and rejects binding a revoked device", async () => {
    const app = createApp();
    const user = await createAuthenticatedUser(app);

    // Enroll a device
    const enrolled = await request(app)
      .post("/api/devices")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ name: "Office PC", fingerprint: "office-pc-fingerprint-123" });
    const deviceId = enrolled.body.device.deviceId;

    // Explicitly bind device to session
    const bindResponse = await request(app)
      .post(`/api/devices/${deviceId}/bind`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(bindResponse.status).toBe(200);
    expect(bindResponse.body.device.deviceId).toBe(deviceId);

    // Revoke the device
    await request(app).patch(`/api/devices/${deviceId}/revoke`).set("Authorization", `Bearer ${user.accessToken}`);

    // Attempting to bind a revoked device must fail
    const revokedBind = await request(app)
      .post(`/api/devices/${deviceId}/bind`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(revokedBind.status).toBe(403);
    expect(revokedBind.body.error.code).toBe("DEVICE_REVOKED");
  });

  it("enforces server-side device ownership: caller cannot bind, revoke, or heartbeat another identity's device", async () => {
    const app = createApp();
    const victim = await createAuthenticatedUser(app, "employee", "Victim");
    const attacker = await createAuthenticatedUser(app, "employee", "Attacker");

    // Victim enrolls a device
    const victimEnroll = await request(app)
      .post("/api/devices")
      .set("Authorization", `Bearer ${victim.accessToken}`)
      .send({ name: "Victim Phone", fingerprint: "victim-fingerprint-12345" });
    const victimDeviceId = victimEnroll.body.device.deviceId;

    // Attacker attempts to bind victim's device
    const bindMismatch = await request(app)
      .post(`/api/devices/${victimDeviceId}/bind`)
      .set("Authorization", `Bearer ${attacker.accessToken}`);
    expect(bindMismatch.status).toBe(403);
    expect(bindMismatch.body.error.code).toBe("DEVICE_IDENTITY_MISMATCH");

    // Attacker attempts to send heartbeat to victim's device
    const heartbeatMismatch = await request(app)
      .post(`/api/devices/${victimDeviceId}/heartbeat`)
      .set("Authorization", `Bearer ${attacker.accessToken}`);
    expect(heartbeatMismatch.status).toBe(403);
    expect(heartbeatMismatch.body.error.code).toBe("DEVICE_IDENTITY_MISMATCH");

    // Attacker attempts to revoke victim's device
    const revokeMismatch = await request(app)
      .patch(`/api/devices/${victimDeviceId}/revoke`)
      .set("Authorization", `Bearer ${attacker.accessToken}`);
    expect(revokeMismatch.status).toBe(403);
    expect(revokeMismatch.body.error.code).toBe("DEVICE_IDENTITY_MISMATCH");

    // Attacker attempts to replace victim's device
    const replaceMismatch = await request(app)
      .post(`/api/devices/${victimDeviceId}/replace`)
      .set("Authorization", `Bearer ${attacker.accessToken}`)
      .send({ name: "Rogue Device", fingerprint: "rogue-fingerprint-12345" });
    expect(replaceMismatch.status).toBe(403);
    expect(replaceMismatch.body.error.code).toBe("DEVICE_IDENTITY_MISMATCH");
  });

  it("replaces a device: revokes old device and binds new device", async () => {
    const app = createApp();
    const user = await createAuthenticatedUser(app);

    const oldEnroll = await request(app)
      .post("/api/devices")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ name: "Old Laptop", fingerprint: "old-fingerprint-12345" });
    const oldDeviceId = oldEnroll.body.device.deviceId;

    // Replace device
    const replaceResponse = await request(app)
      .post(`/api/devices/${oldDeviceId}/replace`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ name: "New Laptop", fingerprint: "new-fingerprint-12345" });
    expect(replaceResponse.status).toBe(201);
    expect(replaceResponse.body.device.name).toBe("New Laptop");
    expect(replaceResponse.body.device.deviceId).not.toBe(oldDeviceId);

    // Verify old device is now REVOKED
    const list = await request(app).get("/api/devices").set("Authorization", `Bearer ${user.accessToken}`);
    const oldRecord = list.body.devices.find((d: { deviceId: string }) => d.deviceId === oldDeviceId);
    expect(oldRecord.status).toBe("REVOKED");

    // Verify current session is bound to new device
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${user.accessToken}`);
    expect(me.body.session.deviceId).toBe(replaceResponse.body.device.deviceId);
  });
});

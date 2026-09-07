import request from "supertest";
import { Wallet } from "ethers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { clearChallengeStore } from "../src/services/auth/challengeStore.js";
import { clearAuditEvents, listAuditEvents } from "../src/services/audit/audit.service.js";
import { assignRole, clearIdentityStore, registerIdentity } from "../src/services/identity.service.js";
import { clearSessionStore } from "../src/services/session.service.js";
import { clearDeviceStore } from "../src/services/device.service.js";

type TestWallet = ReturnType<typeof Wallet.createRandom>;

async function authenticate(app: ReturnType<typeof createApp>, wallet: TestWallet, displayName: string, role: string) {
  const identity = registerIdentity(wallet.address, displayName);
  assignRole(identity.identityId, role);

  const challengeResponse = await request(app).post("/api/auth/challenge").send({ walletAddress: wallet.address });
  const message = challengeResponse.body.challenge.message as string;
  const signature = await wallet.signMessage(message);
  const verifyResponse = await request(app).post("/api/auth/verify").send({
    walletAddress: wallet.address,
    message,
    signature,
  });
  const accessToken = verifyResponse.body.result.session.accessToken as string;
  await request(app).post("/api/devices").set("Authorization", `Bearer ${accessToken}`).send({
    name: "Test browser",
    fingerprint: `${role}-device-fingerprint`,
  });
  return accessToken;
}

describe("protected resources", () => {
  beforeEach(() => {
    clearChallengeStore();
    clearIdentityStore();
    clearSessionStore();
    clearDeviceStore();
    clearAuditEvents();
  });

  it("requires a valid session", async () => {
    const response = await request(createApp()).get("/api/resources/employee");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("SESSION_MISSING");
  });

  it("allows role permissions and denies missing permissions", async () => {
    const app = createApp();
    const accessToken = await authenticate(app, Wallet.createRandom(), "Employee", "employee");

    const employeeResponse = await request(app)
      .get("/api/resources/employee")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(employeeResponse.status).toBe(200);

    const payrollResponse = await request(app)
      .get("/api/resources/payroll")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(payrollResponse.status).toBe(403);
    expect(payrollResponse.body.error.code).toBe("AUTHORIZATION_DENIED");

    expect(listAuditEvents().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "ACCESS_DECISION", resource: "employee", outcome: "ALLOWED" }),
        expect.objectContaining({ eventType: "ACCESS_DECISION", resource: "payroll", outcome: "DENIED" }),
      ]),
    );
  });

  it("allows managers to access payroll", async () => {
    const app = createApp();
    const accessToken = await authenticate(app, Wallet.createRandom(), "Manager", "manager");

    const response = await request(app)
      .get("/api/resources/payroll")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.resource).toBe("payroll");
  });
});
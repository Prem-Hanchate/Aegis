import request from "supertest";
import { Wallet } from "ethers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { clearChallengeStore } from "../src/services/auth/challengeStore.js";
import { clearAuditEvents, listAuditEvents, recordAuditEvent, summarizeAuditEvents } from "../src/services/audit/audit.service.js";
import { clearDeviceStore } from "../src/services/device.service.js";
import { assignRole, clearIdentityStore, registerIdentity } from "../src/services/identity.service.js";
import { clearSessionStore } from "../src/services/session.service.js";
import { clearAuthorizationState } from "../src/services/authorization/authorization.service.js";

async function loginAsAdmin(app: ReturnType<typeof createApp>) {
  const wallet = Wallet.createRandom();
  const identity = registerIdentity(wallet.address, "Audit administrator");
  assignRole(identity.identityId, "admin");
  const challenge = await request(app).post("/api/auth/challenge").send({ walletAddress: wallet.address });
  const message = challenge.body.challenge.message as string;
  const verification = await request(app).post("/api/auth/verify").send({
    walletAddress: wallet.address,
    message,
    signature: await wallet.signMessage(message),
  });
  return verification.body.result.session.accessToken as string;
}

describe("audit dashboard API", () => {
  beforeEach(() => {
    clearChallengeStore();
    clearIdentityStore();
    clearSessionStore();
    clearDeviceStore();
    clearAuditEvents();
    clearAuthorizationState();
  });

  it("returns correct filtered pages and summary counts", async () => {
    const app = createApp();
    const token = await loginAsAdmin(app);
    recordAuditEvent({ eventType: "TEST_ACCESS", identityId: "identity-a", resource: "reports", action: "read", outcome: "ALLOWED", reason: null, actor: "actor-a" });
    recordAuditEvent({ eventType: "TEST_ACCESS", identityId: "identity-a", resource: "reports", action: "read", outcome: "DENIED", reason: "blocked", actor: "actor-a" });
    recordAuditEvent({ eventType: "TEST_POLICY", identityId: "identity-b", resource: "policies", action: "manage", outcome: "SUCCESS", reason: "changed", actor: "actor-b" });
    const expectedSummary = summarizeAuditEvents();

    const page = await request(app)
      .get("/api/audit?identityId=identity-a&eventType=TEST_ACCESS&limit=1&offset=1")
      .set("Authorization", `Bearer ${token}`);
    expect(page.status).toBe(200);
    expect(page.body.total).toBe(2);
    expect(page.body.events).toHaveLength(1);
    expect(page.body.events[0]).toMatchObject({ outcome: "DENIED", reason: "blocked" });

    const summary = await request(app).get("/api/audit/summary").set("Authorization", `Bearer ${token}`);
    expect(summary.status).toBe(200);
    expect(summary.body.summary).toMatchObject({
      total: expectedSummary.total + 2,
      byOutcome: {
        ALLOWED: (expectedSummary.byOutcome.ALLOWED ?? 0) + 2,
        DENIED: expectedSummary.byOutcome.DENIED ?? 0,
        SUCCESS: expectedSummary.byOutcome.SUCCESS ?? 0,
      },
    });
  });

  it("rejects invalid filters and enforces the maximum page size", async () => {
    const app = createApp();
    const token = await loginAsAdmin(app);
    const invalid = await request(app).get("/api/audit?limit=0").set("Authorization", `Bearer ${token}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");

    for (let index = 0; index < 101; index += 1) {
      recordAuditEvent({ eventType: "BOUNDED", identityId: null, resource: null, action: null, outcome: "SUCCESS", reason: null, actor: null });
    }
    const bounded = await request(app).get("/api/audit?limit=1000").set("Authorization", `Bearer ${token}`);
    expect(bounded.status).toBe(400);
    expect(bounded.body.error.code).toBe("VALIDATION_ERROR");
    expect(listAuditEvents({ limit: 1000 }).events).toHaveLength(100);
  });

  it("records authentication failures and denies audit access to non-administrators", async () => {
    const app = createApp();
    const wallet = Wallet.createRandom();
    const identity = registerIdentity(wallet.address, "Employee");
    assignRole(identity.identityId, "employee");
    const challenge = await request(app).post("/api/auth/challenge").send({ walletAddress: wallet.address });
    await request(app).post("/api/auth/verify").send({
      walletAddress: wallet.address,
      message: challenge.body.challenge.message,
      signature: "0x1234",
    });
    expect(listAuditEvents({ eventType: "AUTHENTICATION_FAILURE" }).total).toBe(1);

    const employeeChallenge = await request(app).post("/api/auth/challenge").send({ walletAddress: wallet.address });
    const employeeToken = (await request(app).post("/api/auth/verify").send({
      walletAddress: wallet.address,
      message: employeeChallenge.body.challenge.message,
      signature: await wallet.signMessage(employeeChallenge.body.challenge.message),
    })).body.result.session.accessToken as string;
    const denied = await request(app).get("/api/audit").set("Authorization", `Bearer ${employeeToken}`);
    expect(denied.status).toBe(403);
  });
});

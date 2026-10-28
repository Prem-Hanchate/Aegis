import request from "supertest";
import { Wallet } from "ethers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { clearIdentityStore } from "../src/services/identity.service.js";
import { assignRole } from "../src/services/identity.service.js";
import { registerIdentity } from "../src/services/identity.service.js";
import { clearChallengeStore } from "../src/services/auth/challengeStore.js";
import { clearSessionStore } from "../src/services/session.service.js";
import { clearAuthorizationState } from "../src/services/authorization/authorization.service.js";

async function loginAsAdmin(app: ReturnType<typeof createApp>) {
  const adminWallet = Wallet.createRandom();
  const admin = registerIdentity(adminWallet.address, "Administrator");
  assignRole(admin.identityId, "admin");
  const challenge = await request(app).post("/api/auth/challenge").send({ walletAddress: adminWallet.address });
  const message = challenge.body.challenge.message as string;
  const signature = await adminWallet.signMessage(message);
  const response = await request(app).post("/api/auth/verify").send({
    walletAddress: adminWallet.address,
    message,
    signature,
  });
  return response.body.result.session.accessToken as string;
}

describe("identity endpoints", () => {
  beforeEach(() => {
    clearIdentityStore();
    clearChallengeStore();
    clearSessionStore();
    clearAuthorizationState();
  });

  it("registers, lists, reads, and revokes an identity", async () => {
    const wallet = Wallet.createRandom();
    const app = createApp();
    const accessToken = await loginAsAdmin(app);

    const createResponse = await request(app).post("/api/identities").set("Authorization", `Bearer ${accessToken}`).send({
      walletAddress: wallet.address.toLowerCase(),
      displayName: "Test User",
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.identity).toMatchObject({
      walletAddress: wallet.address,
      displayName: "Test User",
      status: "ACTIVE",
      roles: [],
    });

    const identityId = createResponse.body.identity.identityId as string;

    const listResponse = await request(app).get("/api/identities").set("Authorization", `Bearer ${accessToken}`);
    expect(listResponse.body.identities).toHaveLength(2);

    const readResponse = await request(app).get(`/api/identities/${identityId}`).set("Authorization", `Bearer ${accessToken}`);
    expect(readResponse.body.identity.identityId).toBe(identityId);

    const revokeResponse = await request(app).patch(`/api/identities/${identityId}/status`).set("Authorization", `Bearer ${accessToken}`).send({
      status: "REVOKED",
    });
    expect(revokeResponse.body.identity.status).toBe("REVOKED");
  });

  it("rejects duplicate wallets and invalid input", async () => {
    const wallet = Wallet.createRandom();
    const app = createApp();

    const accessToken = await loginAsAdmin(app);
    const firstResponse = await request(app).post("/api/identities").set("Authorization", `Bearer ${accessToken}`).send({
      walletAddress: wallet.address,
      displayName: "First User",
    });
    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await request(app).post("/api/identities").set("Authorization", `Bearer ${accessToken}`).send({
      walletAddress: wallet.address,
      displayName: "Second User",
    });
    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.error.code).toBe("IDENTITY_ALREADY_EXISTS");

    const invalidResponse = await request(app).post("/api/identities").set("Authorization", `Bearer ${accessToken}`).send({
      walletAddress: "not-a-wallet",
      displayName: "Invalid User",
    });
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error.code).toBe("IDENTITY_INVALID_WALLET_ADDRESS");
  });
});
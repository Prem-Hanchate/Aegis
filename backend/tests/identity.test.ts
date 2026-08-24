import request from "supertest";
import { Wallet } from "ethers";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { clearIdentityStore } from "../src/services/identity.service.js";

describe("identity endpoints", () => {
  beforeEach(() => {
    clearIdentityStore();
  });

  it("registers, lists, reads, and revokes an identity", async () => {
    const wallet = Wallet.createRandom();
    const app = createApp();

    const createResponse = await request(app).post("/api/identities").send({
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
    const listResponse = await request(app).get("/api/identities");
    expect(listResponse.body.identities).toHaveLength(1);

    const readResponse = await request(app).get(`/api/identities/${identityId}`);
    expect(readResponse.body.identity.identityId).toBe(identityId);

    const revokeResponse = await request(app).patch(`/api/identities/${identityId}/status`).send({
      status: "REVOKED",
    });
    expect(revokeResponse.body.identity.status).toBe("REVOKED");
  });

  it("rejects duplicate wallets and invalid input", async () => {
    const wallet = Wallet.createRandom();
    const app = createApp();

    const firstResponse = await request(app).post("/api/identities").send({
      walletAddress: wallet.address,
      displayName: "First User",
    });
    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await request(app).post("/api/identities").send({
      walletAddress: wallet.address,
      displayName: "Second User",
    });
    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.error.code).toBe("IDENTITY_ALREADY_EXISTS");

    const invalidResponse = await request(app).post("/api/identities").send({
      walletAddress: "not-a-wallet",
      displayName: "Invalid User",
    });
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error.code).toBe("IDENTITY_INVALID_WALLET_ADDRESS");
  });
});
import request from "supertest";
import { Wallet } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { clearChallengeStore } from "../src/services/auth/challengeStore.js";
import { AUTH_DOMAIN } from "../src/services/auth/auth-message.js";
import { issueLoginChallenge, verifyLoginChallenge } from "../src/services/auth/auth.service.js";
import { clearIdentityStore, registerIdentity, updateIdentityStatus } from "../src/services/identity.service.js";
import { clearSessionStore } from "../src/services/session.service.js";

describe("auth endpoints", () => {
  beforeEach(() => {
    clearChallengeStore();
    clearIdentityStore();
    clearSessionStore();
    vi.useRealTimers();
  });

  it("accepts a valid nonce and signature", async () => {
    const wallet = Wallet.createRandom();
    const app = createApp();
    registerIdentity(wallet.address, "Test User");

    const challengeResponse = await request(app).post("/api/auth/challenge").send({
      walletAddress: wallet.address,
    });

    expect(challengeResponse.status).toBe(201);
    const { message } = challengeResponse.body.challenge as { message: string };
    const signature = await wallet.signMessage(message);

    const verifyResponse = await request(app).post("/api/auth/verify").send({
      walletAddress: wallet.address,
      message,
      signature,
    });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body).toMatchObject({
      status: "authenticated",
      result: {
        walletAddress: wallet.address,
      },
    });
  });

  it("rejects an invalid signature", async () => {
    const wallet = Wallet.createRandom();
    const attacker = Wallet.createRandom();
    const app = createApp();

    const challengeResponse = await request(app).post("/api/auth/challenge").send({
      walletAddress: wallet.address,
    });

    const { message } = challengeResponse.body.challenge as { message: string };
    const signature = await attacker.signMessage(message);

    const verifyResponse = await request(app).post("/api/auth/verify").send({
      walletAddress: wallet.address,
      message,
      signature,
    });

    expect(verifyResponse.status).toBe(400);
    expect(verifyResponse.body.error.code).toBe("AUTH_INVALID_SIGNATURE");
  });

  it("rejects a wallet without a registered identity", async () => {
    const wallet = Wallet.createRandom();
    const app = createApp();

    const challengeResponse = await request(app).post("/api/auth/challenge").send({
      walletAddress: wallet.address,
    });
    const { message } = challengeResponse.body.challenge as { message: string };
    const signature = await wallet.signMessage(message);

    const verifyResponse = await request(app).post("/api/auth/verify").send({
      walletAddress: wallet.address,
      message,
      signature,
    });

    expect(verifyResponse.status).toBe(403);
    expect(verifyResponse.body.error.code).toBe("AUTH_IDENTITY_NOT_FOUND");
  });

  it("rejects a revoked identity", async () => {
    const wallet = Wallet.createRandom();
    const app = createApp();
    const identity = registerIdentity(wallet.address, "Test User");
    updateIdentityStatus(identity.identityId, "REVOKED");

    const challengeResponse = await request(app).post("/api/auth/challenge").send({
      walletAddress: wallet.address,
    });
    const { message } = challengeResponse.body.challenge as { message: string };
    const signature = await wallet.signMessage(message);

    const verifyResponse = await request(app).post("/api/auth/verify").send({
      walletAddress: wallet.address,
      message,
      signature,
    });

    expect(verifyResponse.status).toBe(403);
    expect(verifyResponse.body.error.code).toBe("AUTH_IDENTITY_REVOKED");
  });

  it("rejects a wrong wallet address", async () => {
    const wallet = Wallet.createRandom();
    const wrongWallet = Wallet.createRandom();
    const app = createApp();

    const challengeResponse = await request(app).post("/api/auth/challenge").send({
      walletAddress: wallet.address,
    });

    const { message } = challengeResponse.body.challenge as { message: string };
    const signature = await wallet.signMessage(message);

    const verifyResponse = await request(app).post("/api/auth/verify").send({
      walletAddress: wrongWallet.address,
      message,
      signature,
    });

    expect(verifyResponse.status).toBe(400);
    expect(verifyResponse.body.error.code).toBe("AUTH_WALLET_MISMATCH");
  });

  it("rejects an expired nonce", async () => {
    const wallet = Wallet.createRandom();
    registerIdentity(wallet.address, "Test User");
    const issuedAt = new Date("2026-08-14T00:00:00.000Z");
    const challenge = issueLoginChallenge(wallet.address, issuedAt);
    const signature = await wallet.signMessage(challenge.message);

    try {
      verifyLoginChallenge(wallet.address, challenge.message, signature, new Date(issuedAt.getTime() + 6 * 60 * 1000));
      throw new Error("Expected expired nonce to throw.");
    } catch (error) {
      expect(error).toHaveProperty("code", "AUTH_NONCE_EXPIRED");
    }
  });

  it("rejects a reused nonce", async () => {
    const wallet = Wallet.createRandom();
    const app = createApp();
    registerIdentity(wallet.address, "Test User");

    const challengeResponse = await request(app).post("/api/auth/challenge").send({
      walletAddress: wallet.address,
    });

    const { message } = challengeResponse.body.challenge as { message: string };
    const signature = await wallet.signMessage(message);

    const firstVerifyResponse = await request(app).post("/api/auth/verify").send({
      walletAddress: wallet.address,
      message,
      signature,
    });

    expect(firstVerifyResponse.status).toBe(200);

    const secondVerifyResponse = await request(app).post("/api/auth/verify").send({
      walletAddress: wallet.address,
      message,
      signature,
    });

    expect(secondVerifyResponse.status).toBe(400);
    expect(secondVerifyResponse.body.error.code).toBe("AUTH_NONCE_REUSED");
  });

  it("issues a session and revokes it on logout", async () => {
    const wallet = Wallet.createRandom();
    const app = createApp();
    registerIdentity(wallet.address, "Test User");

    const challengeResponse = await request(app).post("/api/auth/challenge").send({
      walletAddress: wallet.address,
    });
    const { message } = challengeResponse.body.challenge as { message: string };
    const signature = await wallet.signMessage(message);

    const verifyResponse = await request(app).post("/api/auth/verify").send({
      walletAddress: wallet.address,
      message,
      signature,
    });
    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.result.session.accessToken).toEqual(expect.any(String));

    const accessToken = verifyResponse.body.result.session.accessToken as string;
    const logoutResponse = await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${accessToken}`);
    expect(logoutResponse.status).toBe(204);

    const secondLogoutResponse = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(secondLogoutResponse.status).toBe(401);
    expect(secondLogoutResponse.body.error.code).toBe("SESSION_INVALID");
  });

  it("rejects a wrong domain in the signed message", async () => {
    const wallet = Wallet.createRandom();
    const app = createApp();

    const challengeResponse = await request(app).post("/api/auth/challenge").send({
      walletAddress: wallet.address,
    });

    const originalMessage = challengeResponse.body.challenge.message as string;
    const tamperedMessage = originalMessage.replace(`Domain: ${AUTH_DOMAIN}`, "Domain: evil.example");
    const signature = await wallet.signMessage(tamperedMessage);

    const verifyResponse = await request(app).post("/api/auth/verify").send({
      walletAddress: wallet.address,
      message: tamperedMessage,
      signature,
    });

    expect(verifyResponse.status).toBe(400);
    expect(verifyResponse.body.error.code).toBe("AUTH_DOMAIN_MISMATCH");
  });
});
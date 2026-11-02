import { describe, expect, it } from "vitest";
import {
  challengeRepository,
  identityRepository,
  resetMongoRepositories,
  sessionRepository,
} from "../src/repositories/index.js";
import { MongoIdentityRepository, MongoSessionRepository } from "../src/repositories/mongodb.js";

describe("MongoDB persistence", () => {

  it("prevents concurrent challenge claims", async () => {
    await resetMongoRepositories();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 300_000);
    await challengeRepository.create({
      nonce: "persistence-test-nonce",
      walletAddress: "0x0000000000000000000000000000000000000001",
      domain: "localhost",
      message: "test",
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      purpose: "login",
      used: false,
      usedAt: null,
    });

    const claims = await Promise.all([
      challengeRepository.claim("persistence-test-nonce", issuedAt),
      challengeRepository.claim("persistence-test-nonce", issuedAt),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("persists identity and session revocation across repository instances", async () => {
    const now = new Date();
    const identity = {
      identityId: "persistent-identity",
      walletAddress: "0x0000000000000000000000000000000000000002",
      displayName: "Persistent User",
      status: "ACTIVE" as const,
      roles: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await identityRepository.create(identity);
    expect(await new MongoIdentityRepository().findById(identity.identityId)).toMatchObject(identity);

    const session = {
      sessionId: "persistent-session",
      identityId: identity.identityId,
      deviceId: null,
      tokenHash: "persistent-token-hash",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      status: "ACTIVE" as const,
      revokedAt: null,
    };
    await sessionRepository.create(session);
    await new MongoSessionRepository().revoke(session.sessionId, now);
    expect(await sessionRepository.findActiveByTokenHash(session.tokenHash)).toBeNull();

    await new MongoIdentityRepository().revoke(identity.identityId, now);
    expect((await identityRepository.findById(identity.identityId))?.status).toBe("REVOKED");
  });

  it("enforces unique identities and rejects expired challenge claims", async () => {
    const now = new Date();
    const identity = {
      identityId: "unique-identity",
      walletAddress: "0x0000000000000000000000000000000000000003",
      displayName: "Unique User",
      status: "ACTIVE" as const,
      roles: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await identityRepository.create(identity);
    await expect(identityRepository.create(identity)).rejects.toMatchObject({ code: 11000 });

    await challengeRepository.create({
      nonce: "expired-persistence-nonce",
      walletAddress: identity.walletAddress,
      domain: "localhost",
      message: "expired",
      issuedAt: new Date(now.getTime() - 600_000).toISOString(),
      expiresAt: new Date(now.getTime() - 300_000).toISOString(),
      purpose: "login",
      used: false,
      usedAt: null,
    });
    expect(await challengeRepository.claim("expired-persistence-nonce", now)).toBeNull();
  });
});

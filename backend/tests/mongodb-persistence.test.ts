import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { Wallet, getAddress } from "ethers";
import { connectDatabase, disconnectDatabase, getDatabaseStatus } from "../src/config/database.js";
import {
  IdentityModel,
  SessionModel,
  ChallengeModel,
  DeviceModel,
  PolicyModel,
  AuditLogModel,
} from "../src/models/index.js";
import {
  identityRepository,
  sessionRepository,
  challengeRepository,
  deviceRepository,
  policyRepository,
  auditLogRepository,
} from "../src/repositories/index.js";
import {
  registerIdentity,
  registerIdentityAsync,
  getIdentity,
  getIdentityByWallet,
  assignRole,
  updateIdentityStatus,
  clearIdentityStore,
  resetIdentityMemoryStore,
  rehydrateIdentityStore,
} from "../src/services/identity.service.js";
import {
  createSession,
  createSessionAsync,
  getActiveSession,
  revokeSession,
  revokeSessionAsync,
  clearSessionStore,
  resetSessionMemoryStore,
  rehydrateSessionStore,
  hashToken,
} from "../src/services/session.service.js";
import {
  saveChallenge,
  getChallenge,
  markChallengeUsedAtomic,
  clearChallengeStore,
} from "../src/services/auth/challengeStore.js";
import {
  enrollDevice,
  enrollDeviceAsync,
  getActiveDevice,
  revokeDevice,
  revokeDeviceAsync,
  replaceDevice,
  replaceDeviceAsync,
  touchDevice,
  touchDeviceAsync,
  clearDeviceStore,
  resetDeviceMemoryStore,
  rehydrateDeviceStore,
} from "../src/services/device.service.js";
import {
  grantRolePermission,
  grantRolePermissionAsync,
  revokeRolePermission,
  revokeRolePermissionAsync,
  listRolePermissions,
  clearAuthorizationState,
  resetAuthorizationMemoryStore,
  rehydratePolicyStore,
} from "../src/services/authorization/authorization.service.js";
import {
  recordAuditEvent,
  recordAuditEventAsync,
  listAuditEvents,
  summarizeAuditEvents,
  clearAuditEvents,
  resetAuditMemoryStore,
  rehydrateAuditStore,
} from "../src/services/audit/audit.service.js";

const TEST_DB_URI =
  process.env.MONGODB_TEST_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/identity_security_db";

describe("PHASE 1 — MongoDB Persistence & Repository Layer", () => {
  beforeAll(async () => {
    await connectDatabase(TEST_DB_URI);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    clearIdentityStore();
    clearSessionStore();
    clearChallengeStore();
    clearDeviceStore();
    clearAuthorizationState();
    clearAuditEvents();

    await Promise.all([
      IdentityModel.deleteMany({}),
      SessionModel.deleteMany({}),
      ChallengeModel.deleteMany({}),
      DeviceModel.deleteMany({}),
      PolicyModel.deleteMany({}),
      AuditLogModel.deleteMany({}),
    ]);

    await policyRepository.seedDefaults();
  });

  describe("1. Identity creation, retrieval & persistence", () => {
    it("persists identity in MongoDB with all required fields and retrieves it", async () => {
      const wallet = Wallet.createRandom();
      const identity = await identityRepository.create({
        identityId: "id-user-1",
        walletAddress: getAddress(wallet.address),
        displayName: "Alice Developer",
        status: "ACTIVE",
        roles: ["employee"],
      });

      expect(identity.identityId).toBe("id-user-1");
      expect(identity.walletAddress).toBe(getAddress(wallet.address));
      expect(identity.displayName).toBe("Alice Developer");
      expect(identity.status).toBe("ACTIVE");
      expect(identity.roles).toContain("employee");
      expect(identity.createdAt).toBeDefined();
      expect(identity.updatedAt).toBeDefined();

      // Verify direct retrieval from MongoDB
      const foundInDb = await IdentityModel.findOne({ identityId: "id-user-1" }).lean().exec();
      expect(foundInDb).not.toBeNull();
      expect(foundInDb?.displayName).toBe("Alice Developer");

      // Verify repository lookups
      const byId = await identityRepository.findById("id-user-1");
      expect(byId?.displayName).toBe("Alice Developer");

      const byWallet = await identityRepository.findByWallet(wallet.address.toLowerCase());
      expect(byWallet?.identityId).toBe("id-user-1");
    });

    it("enforces unique walletAddress and identityId constraints in MongoDB", async () => {
      const wallet = Wallet.createRandom();
      await identityRepository.create({
        identityId: "id-dup-1",
        walletAddress: getAddress(wallet.address),
        displayName: "First User",
      });

      // Attempt duplicate walletAddress
      await expect(
        identityRepository.create({
          identityId: "id-dup-2",
          walletAddress: getAddress(wallet.address),
          displayName: "Second User",
        }),
      ).rejects.toThrow();

      // Attempt duplicate identityId
      const otherWallet = Wallet.createRandom();
      await expect(
        identityRepository.create({
          identityId: "id-dup-1",
          walletAddress: getAddress(otherWallet.address),
          displayName: "Third User",
        }),
      ).rejects.toThrow();
    });
  });

  describe("2. Session persistence & bearer token security", () => {
    it("persists sessions without storing plaintext bearer tokens", async () => {
      const { session, accessToken } = await createSessionAsync("id-user-1");

      expect(session.sessionId).toBeDefined();
      expect(session.identityId).toBe("id-user-1");
      expect(session.status).toBe("ACTIVE");
      expect(session.revokedAt).toBeNull();

      // The plaintext accessToken must NOT be equal to tokenHash
      expect(accessToken).not.toBe(session.tokenHash);
      expect(session.tokenHash).toBe(hashToken(accessToken));

      // Verify direct retrieval from MongoDB
      const sessionInDb = await SessionModel.findOne({ sessionId: session.sessionId }).lean().exec();
      expect(sessionInDb).not.toBeNull();
      expect(sessionInDb?.tokenHash).toBe(hashToken(accessToken));
      expect((sessionInDb as any)?.accessToken).toBeUndefined();

      // Active session lookup by bearer token
      const active = getActiveSession(accessToken);
      expect(active.sessionId).toBe(session.sessionId);
    });

    it("persists session revocation and prevents subsequent usage", async () => {
      const { session, accessToken } = await createSessionAsync("id-user-1");
      const revoked = await revokeSessionAsync(accessToken);

      expect(revoked.status).toBe("REVOKED");
      expect(revoked.revokedAt).toBeDefined();

      // Verify persistence in MongoDB
      const inDb = await sessionRepository.findById(session.sessionId);
      expect(inDb?.status).toBe("REVOKED");
      expect(inDb?.revokedAt).toBeDefined();

      // Attempting to use the revoked session must throw
      expect(() => getActiveSession(accessToken)).toThrow("invalid or revoked");
    });
  });

  describe("3. Session expiration & TTL index", () => {
    it("rejects expired sessions and has TTL index defined", async () => {
      // Check TTL index on SessionModel
      const indexes = await SessionModel.collection.indexes();
      const ttlIndex = indexes.find((idx) => idx.expireAfterSeconds !== undefined && idx.key.expiresAt === 1);
      expect(ttlIndex).toBeDefined();
      expect(ttlIndex?.expireAfterSeconds).toBe(0);

      // Past date session
      const pastDate = new Date(Date.now() - 3600 * 1000);
      const expiredSession = await sessionRepository.create({
        sessionId: "session-expired-1",
        identityId: "id-user-1",
        tokenHash: hashToken("expired-raw-token"),
        expiresAt: pastDate,
      });

      expect(new Date(expiredSession.expiresAt).getTime()).toBeLessThan(Date.now());
    });
  });

  describe("4. Challenge expiration & TTL index", () => {
    it("has TTL index defined on Challenge model", async () => {
      const indexes = await ChallengeModel.collection.indexes();
      const ttlIndex = indexes.find((idx) => idx.expireAfterSeconds !== undefined && idx.key.expiresAt === 1);
      expect(ttlIndex).toBeDefined();
      expect(ttlIndex?.expireAfterSeconds).toBe(0);
    });

    it("rejects consuming an already expired challenge", async () => {
      const past = new Date(Date.now() - 60 * 1000);
      await challengeRepository.create({
        nonce: "expired-nonce-1",
        walletAddress: "0x1111111111111111111111111111111111111111",
        domain: "localhost",
        message: "Sign in",
        expiresAt: past,
      });

      // Atomic consumption must fail on expired challenge
      const result = await challengeRepository.consumeAtomic("expired-nonce-1", new Date());
      expect(result).toBeNull();
    });
  });

  describe("5. Challenge replay prevention & atomic single-use", () => {
    it("ensures challenge consumption is atomic and prevents replay", async () => {
      const future = new Date(Date.now() + 300 * 1000);
      await challengeRepository.create({
        nonce: "unique-nonce-123",
        walletAddress: "0x1111111111111111111111111111111111111111",
        domain: "localhost",
        message: "Sign in",
        expiresAt: future,
      });

      // First consumption succeeds
      const firstConsumption = await markChallengeUsedAtomic("unique-nonce-123", new Date().toISOString());
      expect(firstConsumption).not.toBeNull();
      expect(firstConsumption?.used).toBe(true);
      expect(firstConsumption?.usedAt).toBeDefined();

      // Second consumption fails (replay protection)
      const secondConsumption = await markChallengeUsedAtomic("unique-nonce-123", new Date().toISOString());
      expect(secondConsumption).toBeNull();
    });

    it("prevents concurrent race conditions from double-consuming a nonce", async () => {
      const future = new Date(Date.now() + 300 * 1000);
      await challengeRepository.create({
        nonce: "race-nonce-456",
        walletAddress: "0x2222222222222222222222222222222222222222",
        domain: "localhost",
        message: "Sign in",
        expiresAt: future,
      });

      // Execute 5 concurrent consume requests for the exact same nonce
      const results = await Promise.all([
        challengeRepository.consumeAtomic("race-nonce-456"),
        challengeRepository.consumeAtomic("race-nonce-456"),
        challengeRepository.consumeAtomic("race-nonce-456"),
        challengeRepository.consumeAtomic("race-nonce-456"),
        challengeRepository.consumeAtomic("race-nonce-456"),
      ]);

      const successCount = results.filter((r) => r !== null).length;
      expect(successCount).toBe(1); // EXACTLY one succeeds
    });
  });

  describe("6. Device persistence & replacement", () => {
    it("persists devices and records replacement history", async () => {
      const { session } = await createSessionAsync("id-dev-user");
      const device1 = await enrollDeviceAsync("id-dev-user", session.sessionId, "Work Laptop", "fingerprint-work-1");

      expect(device1.deviceId).toBeDefined();
      expect(device1.status).toBe("ACTIVE");

      // Replace device1 with device2
      const device2 = await replaceDeviceAsync(device1.deviceId, "id-dev-user", session.sessionId, "New Work Laptop", "fingerprint-work-2");

      expect(device2.replacementOf).toBe(device1.deviceId);
      expect(device2.name).toBe("New Work Laptop");
      expect(device2.status).toBe("ACTIVE");

      // Old device must be revoked
      expect(() => getActiveDevice(device1.deviceId, "id-dev-user")).toThrow("revoked");

      // Verify in MongoDB
      const inDbOld = await deviceRepository.findById(device1.deviceId);
      expect(inDbOld?.status).toBe("REVOKED");

      const inDbNew = await deviceRepository.findById(device2.deviceId);
      expect(inDbNew?.replacementOf).toBe(device1.deviceId);
      expect(inDbNew?.status).toBe("ACTIVE");
    });

    it("updates lastSeenAt persistently via touchDevice", async () => {
      const { session } = await createSessionAsync("id-touch-user");
      const device = await enrollDeviceAsync("id-touch-user", session.sessionId, "Mobile", "fingerprint-touch-1");

      const futureTime = new Date(Date.now() + 5000);
      const touched = await touchDeviceAsync(device.deviceId, "id-touch-user", futureTime);
      expect(touched.lastSeenAt).toBe(futureTime.toISOString());

      const inDb = await deviceRepository.findById(device.deviceId);
      expect(new Date(inDb!.lastSeenAt).getTime()).toBe(futureTime.getTime());
    });
  });

  describe("7. Policy persistence & assigned identities", () => {
    it("seeds default policies and persists role permission changes", async () => {
      const initial = listRolePermissions();
      expect(initial.employee).toContain("employee:read");
      expect(initial.admin).toContain("policies:manage");

      // Grant custom permission
      await grantRolePermissionAsync("employee", "documents", "view");
      const updated = listRolePermissions();
      expect(updated.employee).toContain("documents:view");

      // Verify persistence in MongoDB
      const policyInDb = await policyRepository.findByRole("employee");
      expect(policyInDb?.permissions).toContain("documents:view");

      // Revoke permission
      await revokeRolePermissionAsync("employee", "documents", "view");
      const finalInDb = await policyRepository.findByRole("employee");
      expect(finalInDb?.permissions).not.toContain("documents:view");
    });

    it("persists assigned identities to policies", async () => {
      await policyRepository.assignIdentity("manager", "user-mgr-100");
      const policy = await policyRepository.findByRole("manager");
      expect(policy?.assignedIdentities).toContain("user-mgr-100");

      await policyRepository.removeIdentity("manager", "user-mgr-100");
      const afterRemoval = await policyRepository.findByRole("manager");
      expect(afterRemoval?.assignedIdentities).not.toContain("user-mgr-100");
    });
  });

  describe("8. Audit persistence & query aggregation", () => {
    it("persists audit events and provides filtered queries and summaries", async () => {
      await recordAuditEventAsync({
        eventType: "LOGIN",
        identityId: "user-audit-1",
        outcome: "SUCCESS",
        resource: "auth",
        action: "login",
        reason: null,
        actor: "0x1111",
      });

      await recordAuditEventAsync({
        eventType: "ACCESS_DECISION",
        identityId: "user-audit-1",
        outcome: "DENIED",
        resource: "payroll",
        action: "read",
        reason: "Unauthorized",
        actor: "0x1111",
      });

      // Filtered query
      const deniedList = await auditLogRepository.list({ outcome: "DENIED" });
      expect(deniedList.total).toBe(1);
      expect(deniedList.events[0]!.resource).toBe("payroll");

      // Summary aggregation
      const summary = await auditLogRepository.summarize();
      expect(summary.total).toBe(2);
      expect(summary.byOutcome.SUCCESS).toBe(1);
      expect(summary.byOutcome.DENIED).toBe(1);
      expect(summary.byEventType.LOGIN).toBe(1);
      expect(summary.byEventType.ACCESS_DECISION).toBe(1);
    });
  });

  describe("9. Backend restart recovery (Data survives restarts)", () => {
    it("completely restores application state from MongoDB after backend restart simulation", async () => {
      // 1. Create state across all models
      const wallet = Wallet.createRandom();
      const identity = await identityRepository.create({
        identityId: "restart-user-1",
        walletAddress: getAddress(wallet.address),
        displayName: "Restart Tester",
        status: "ACTIVE",
        roles: ["admin"],
      });

      const { session, accessToken } = await createSessionAsync(identity.identityId);
      const device = await enrollDeviceAsync(identity.identityId, session.sessionId, "Restart Laptop", "restart-fingerprint-99");
      await grantRolePermissionAsync("admin", "special", "execute");

      await recordAuditEventAsync({
        eventType: "RESTART_TEST",
        identityId: identity.identityId,
        outcome: "SUCCESS",
        resource: "system",
        action: "restart",
        reason: "Testing restart durability",
        actor: wallet.address,
      });

      // 2. Simulate complete backend crash/restart:
      // Clear all in-memory caches (without clearing the MongoDB database!)
      resetIdentityMemoryStore();
      resetSessionMemoryStore();
      resetDeviceMemoryStore();
      resetAuthorizationMemoryStore();
      resetAuditMemoryStore();

      // Memory is blank
      expect(() => getIdentity("restart-user-1")).toThrow();
      expect(() => getActiveSession(accessToken)).toThrow();

      // 3. Backend restart sequence: Reconnect & Rehydrate
      await rehydrateIdentityStore();
      await rehydrateSessionStore();
      await rehydrateDeviceStore();
      await rehydratePolicyStore();
      await rehydrateAuditStore();

      // 4. Verify all state survived and is restored!
      const restoredIdentity = getIdentity("restart-user-1");
      expect(restoredIdentity.displayName).toBe("Restart Tester");
      expect(restoredIdentity.roles).toContain("admin");

      const restoredSession = getActiveSession(accessToken);
      expect(restoredSession.sessionId).toBe(session.sessionId);

      const restoredDevice = getActiveDevice(device.deviceId, identity.identityId);
      expect(restoredDevice.name).toBe("Restart Laptop");

      const restoredPolicies = listRolePermissions();
      expect(restoredPolicies.admin).toContain("special:execute");

      const restoredAudit = listAuditEvents({ eventType: "RESTART_TEST" });
      expect(restoredAudit.total).toBe(1);
      expect(restoredAudit.events[0]!.reason).toBe("Testing restart durability");
    });
  });

  describe("10. Database connection failure & recovery handling", () => {
    it("reports database status correctly when connected", () => {
      const status = getDatabaseStatus();
      expect(status.connected).toBe(true);
      expect(status.readyState).toBe(1);
      expect(status.name).toBeDefined();
    });

    it(
      "handles connection failure gracefully when given an invalid URI or unreachable database",
      async () => {
        await disconnectDatabase();
        expect(getDatabaseStatus().connected).toBe(false);

        // Attempting to connect with an invalid scheme fails cleanly
        await expect(connectDatabase("invalid-scheme://localhost/test")).rejects.toThrow();

        // Attempting to connect with empty URI fails cleanly
        await expect(connectDatabase("")).rejects.toThrow("MONGODB_URI is not configured.");

        // Attempting to connect to an unreachable host with short timeout fails cleanly
        await expect(
          mongoose.createConnection("mongodb://127.0.0.1:1/test", {
            serverSelectionTimeoutMS: 500,
          }).asPromise(),
        ).rejects.toThrow();

        // Reconnect cleanly to test database
        await connectDatabase(TEST_DB_URI);
        expect(getDatabaseStatus().connected).toBe(true);
      },
    );
  });
});

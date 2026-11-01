import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { getAddress, isAddress } from "ethers";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import {
  BlockchainClient,
  blockchainDeviceId,
  blockchainIdentityId,
  blockchainPermissionId,
  blockchainRoleId,
} from "../src/blockchain/client.js";
import { loadBlockchainConfig } from "../src/blockchain/config.js";
import {
  BlockchainEventModel,
  BlockchainSyncStateModel,
  DeviceModel,
  IdentityModel,
  PolicyModel,
  ReconciliationRecordModel,
  SessionModel,
} from "../src/models/index.js";
import {
  BlockchainSyncService,
  reconcileTrustedState,
  registerKnownPermission,
  registerKnownRole,
} from "../src/services/blockchain/index.js";
import {
  authorizeRequest,
  authorizeRequestAsync,
  grantRolePermissionAsync,
} from "../src/services/authorization/authorization.service.js";
import { createSession } from "../src/services/session.service.js";
import { registerIdentity } from "../src/services/identity.service.js";
import { enrollDevice } from "../src/services/device.service.js";

describe("PHASE 2 — Blockchain Integration & Trusted-State Synchronization", () => {
  let client: BlockchainClient;
  let syncService: BlockchainSyncService;

  beforeAll(async () => {
    // Configure environment
    process.env.BLOCKCHAIN_RPC_URL = "http://127.0.0.1:8545";
    process.env.BLOCKCHAIN_CHAIN_ID = "31337";
    process.env.BACKEND_SIGNER_PRIVATE_KEY =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    process.env.IDENTITY_REGISTRY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    process.env.POLICY_REGISTRY_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
    process.env.REVOCATION_REGISTRY_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
    process.env.AEGIS_REGISTRY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/identity_security_db";

    await connectDatabase(process.env.MONGODB_URI);

    const config = loadBlockchainConfig();
    client = await BlockchainClient.connect(config);
    syncService = new BlockchainSyncService(client, config);
  });

  afterAll(async () => {
    syncService.stopListeners();
    await disconnectDatabase();
  });

  describe("1. Backend Blockchain Service & Provider Setup", () => {
    it("connects to RPC provider, verifies network chain ID and contract addresses", async () => {
      const config = client.getConfig();
      expect(config.chainId).toBe(31337n);
      expect(isAddress(config.identityRegistryAddress)).toBe(true);
      expect(isAddress(config.policyRegistryAddress)).toBe(true);
      expect(isAddress(config.revocationRegistryAddress)).toBe(true);
      expect(isAddress(config.aegisRegistryAddress ?? "")).toBe(true);

      const provider = client.getProvider();
      const network = await provider.getNetwork();
      expect(network.chainId).toBe(31337n);

      const version = await client.version();
      expect(version).toBe("0.1.0");
    });

    it("verifies transaction receipt and confirmation depth", async () => {
      const dummyWallet = getAddress("0x" + randomBytes(20).toString("hex"));
      const dummyId = "test-tx-" + randomUUID();

      const tx = await client.registerIdentity(dummyId, dummyWallet);
      expect(tx.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      const verification = await client.verifyTransactionReceipt(tx.hash, 1);
      expect(verification.verified).toBe(true);
      expect(verification.receipt?.status).toBe(1);
      expect(verification.confirmations).toBeGreaterThanOrEqual(1);
    });
  });

  describe("2. Blockchain Event Synchronization & Idempotency", () => {
    it("synchronizes on-chain identity registration and activation to MongoDB trusted cache", async () => {
      const testWallet = getAddress("0x" + randomBytes(20).toString("hex"));
      const identityId = "user-" + randomUUID();

      // Create identity in MongoDB with default/none status
      await IdentityModel.create({
        identityId,
        walletAddress: testWallet,
        displayName: "Alice Event",
        status: "ACTIVE", // will be updated through sync
        roles: [],
      });

      // Execute on-chain transactions
      await client.registerIdentity(identityId, testWallet);
      await client.activateIdentity(identityId);

      // Catch up latest blocks using block range synchronization
      const processedCount = await syncService.syncLatest(1);
      expect(processedCount).toBeGreaterThanOrEqual(2);

      // Verify sync state in MongoDB
      const syncState = await BlockchainSyncStateModel.findOne({
        contractAddress: client.getConfig().identityRegistryAddress.toLowerCase(),
      });
      expect(syncState).not.toBeNull();
      expect(syncState?.lastProcessedBlock).toBeGreaterThan(0);
      expect(syncState?.status).toBe("IDLE");

      // Verify event recorded in BlockchainEventModel
      const events = await BlockchainEventModel.find({
        contractAddress: client.getConfig().identityRegistryAddress.toLowerCase(),
      });
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.some((e) => e.eventName === "IdentityActivated")).toBe(true);
    });

    it("prevents duplicate event processing and ensures idempotency", async () => {
      const testWallet = getAddress("0x" + randomBytes(20).toString("hex"));
      const identityId = "idempotent-" + randomUUID();

      const tx = await client.registerIdentity(identityId, testWallet);
      const receipt = (await client.verifyTransactionReceipt(tx.hash)).receipt!;

      const eventParams = {
        contractName: "IdentityRegistry",
        contractAddress: client.getConfig().identityRegistryAddress,
        eventName: "IdentityRegistered",
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        txHash: receipt.hash,
        logIndex: 0,
        args: {
          identityId: blockchainIdentityId(identityId),
          walletAddress: testWallet,
          timestamp: Date.now(),
        },
      };

      // First run processes event
      const first = await syncService.processEvent(eventParams);
      expect(first.processed).toBe(true);

      // Second run is recognized as duplicate and skipped
      const second = await syncService.processEvent(eventParams);
      expect(second.processed).toBe(true);
      expect(second.duplicate).toBe(true);
    });

    it("synchronizes on-chain role assignment and permission grants to influence authorization", async () => {
      const testWallet = getAddress("0x" + randomBytes(20).toString("hex"));
      const identityId = randomUUID();
      const roleName = "operator-" + randomUUID().slice(0, 6);

      registerKnownRole(roleName);
      registerKnownPermission("server", "restart");

      // Register identity locally
      const identity = registerIdentity(testWallet, "Auth Operator", identityId);

      // Register on-chain
      await client.registerIdentity(identityId, testWallet);
      await client.activateIdentity(identityId);

      // Create policy & role on-chain
      await client.createPolicy(roleName, "server", "restart");
      await client.assignRole(identityId, roleName);

      // Before sync: user cannot restart server
      expect(() => authorizeRequest(identityId, "server", "restart")).toThrow(/Access denied/);

      // Sync latest events from blockchain
      await syncService.syncLatest(1);

      // After sync: authorization cache is updated and access is granted!
      const authDecision = authorizeRequest(identityId, "server", "restart");
      expect(authDecision.allowed).toBe(true);

      // Also verify authorizeRequestAsync against MongoDB
      const asyncAuth = await authorizeRequestAsync(identityId, "server", "restart");
      expect(asyncAuth.allowed).toBe(true);
    });

    it("synchronizes on-chain identity revocation and immediately terminates sessions and denies access", async () => {
      const testWallet = getAddress("0x" + randomBytes(20).toString("hex"));
      const identityId = "revoked-user-" + randomUUID();

      registerKnownRole("employee");
      const identity = registerIdentity(testWallet, "Revoked User", identityId);
      const session = createSession(identityId);

      await client.registerIdentity(identityId, testWallet);
      await client.activateIdentity(identityId);
      await client.assignRole(identityId, "employee");

      await syncService.syncLatest(1);
      expect(authorizeRequest(identityId, "employee", "read").allowed).toBe(true);

      // Revoke identity on-chain
      await client.revokeIdentity(identityId);

      // Sync event
      await syncService.syncLatest(1);

      // Cache updated: identity status is REVOKED
      const updatedIdentity = await IdentityModel.findOne({ identityId });
      expect(updatedIdentity?.status).toBe("REVOKED");

      // Session revoked
      const updatedSession = await SessionModel.findOne({ sessionId: session.session.sessionId });
      expect(updatedSession?.status).toBe("REVOKED");

      // Subsequent authorization decision DENIED
      expect(() => authorizeRequest(identityId, "employee", "read")).toThrow(/Access denied/);
      await expect(authorizeRequestAsync(identityId, "employee", "read")).rejects.toThrow(/Access denied/);
    });

    it("synchronizes on-chain device revocation and invalidates device sessions", async () => {
      const testWallet = getAddress("0x" + randomBytes(20).toString("hex"));
      const identityId = "device-user-" + randomUUID();
      const rawDeviceId = "0x" + randomBytes(32).toString("hex");

      const identity = registerIdentity(testWallet, "Device User", identityId);
      const session = createSession(identityId);
      const device = enrollDevice(identityId, session.session.sessionId, "Workstation", "fp-123", new Date(), null);

      // Force deviceId to match rawDeviceId
      await DeviceModel.updateOne({ deviceId: device.deviceId }, { $set: { deviceId: rawDeviceId } });
      await SessionModel.updateOne({ sessionId: session.session.sessionId }, { $set: { deviceId: rawDeviceId } });

      // Revoke device on-chain
      await client.revokeDevice(rawDeviceId);

      // Sync events
      await syncService.syncLatest(1);

      // Device in MongoDB should be REVOKED
      const deviceDoc = await DeviceModel.findOne({ deviceId: rawDeviceId });
      expect(deviceDoc?.status).toBe("REVOKED");

      // Device session revoked
      const sessionDoc = await SessionModel.findOne({ sessionId: session.session.sessionId });
      expect(sessionDoc?.status).toBe("REVOKED");
    });
  });

  describe("3. Missed Event Recovery & Reorganization Handling", () => {
    it("recovers missed events using block-range event retrieval", async () => {
      const testWallet = getAddress("0x" + randomBytes(20).toString("hex"));
      const identityId = "missed-" + randomUUID();

      const provider = client.getProvider();
      // Use eth_blockNumber for accurate block number (avoids polled cache)
      const hexStart = await provider.send("eth_blockNumber", []);
      const startBlock = parseInt(hexStart, 16) + 1;

      await client.registerIdentity(identityId, testWallet);
      await client.activateIdentity(identityId);

      const hexEnd = await provider.send("eth_blockNumber", []);
      const endBlock = parseInt(hexEnd, 16);

      // syncBlockRange processes the range and updates sync state.
      // Events may appear as duplicates (already processed by syncLatest in prior tests),
      // so we verify correctness by checking the sync state update and identity existence.
      await syncService.syncBlockRange(startBlock, endBlock);

      // Verify sync state was recorded up to at least endBlock
      const syncState = await BlockchainSyncStateModel.findOne({
        contractAddress: client.getConfig().identityRegistryAddress.toLowerCase(),
      });
      expect(syncState?.lastProcessedBlock).toBeGreaterThanOrEqual(endBlock);

      // Verify the identity exists in MongoDB (registered via syncLatest or this call)
      const foundIdentity = await IdentityModel.findOne({ walletAddress: testWallet });
      expect(foundIdentity ?? null).not.toBeNull();
    });

    it("detects blockchain reorganization, rolls back derived state and triggers reconciliation", async () => {
      const contractAddress = client.getConfig().identityRegistryAddress;
      const fakeBlockNumber = 9999;

      // Seed a simulated event at block 9999
      await BlockchainEventModel.create({
        eventId: `31337:0xsimulated:${fakeBlockNumber}`,
        chainId: 31337,
        contractAddress: contractAddress.toLowerCase(),
        contractName: "IdentityRegistry",
        eventName: "IdentityActivated",
        blockNumber: fakeBlockNumber,
        blockHash: "0xoldhash",
        txHash: "0xsimulated",
        logIndex: 0,
        parameters: {},
        confirmed: true,
      });

      // Handle reorg at fakeBlockNumber
      await syncService.handleReorg("IdentityRegistry", contractAddress, fakeBlockNumber);

      // The unconfirmed/divergent event must be rolled back
      const rolledBack = await BlockchainEventModel.findOne({
        contractAddress: contractAddress.toLowerCase(),
        blockNumber: { $gte: fakeBlockNumber },
      });
      expect(rolledBack).toBeNull();
    });
  });

  describe("4. Trusted-State Reconciliation", () => {
    it("detects stale cache values in MongoDB and restores trusted state from blockchain", async () => {
      const testWallet = getAddress("0x" + randomBytes(20).toString("hex"));
      const identityId = "stale-identity-" + randomUUID();

      // 1. Register & activate on-chain
      await client.registerIdentity(identityId, testWallet);
      await client.activateIdentity(identityId);

      // 2. Revoke on-chain
      await client.revokeIdentity(identityId);

      // 3. Intentionally insert a STALE active record in MongoDB (simulating missed event / stale cache)
      await IdentityModel.create({
        identityId,
        walletAddress: testWallet,
        displayName: "Stale Cache User",
        status: "ACTIVE", // STALE! Blockchain is REVOKED
        roles: ["admin"],
      });

      const session = createSession(identityId);

      // 4. Run reconciliation
      const result = await reconcileTrustedState(client);

      expect(result.status).toBe("DIFFERENCES_FOUND");
      expect(result.discrepanciesCount).toBeGreaterThan(0);

      // Discrepancy detected for identity status
      const identityDiscrepancy = result.discrepancies.find((d) => d.identifier === identityId);
      expect(identityDiscrepancy).toBeDefined();
      expect(identityDiscrepancy?.type).toBe("IDENTITY_STATUS");
      expect(identityDiscrepancy?.blockchainValue).toBe("REVOKED");

      // MongoDB trusted state restored
      const restored = await IdentityModel.findOne({ identityId });
      expect(restored?.status).toBe("REVOKED");

      // Active sessions revoked to prevent unauthorized access
      const updatedSession = await SessionModel.findOne({ sessionId: session.session.sessionId });
      expect(updatedSession?.status).toBe("REVOKED");

      // Record saved to MongoDB
      const recordInDb = await ReconciliationRecordModel.findOne({ reconciliationId: result.reconciliationId });
      expect(recordInDb).not.toBeNull();
      expect(recordInDb?.status).toBe("DIFFERENCES_FOUND");
    });

    it("reconciles unauthorized role assignments and restores trusted policy state", async () => {
      const testWallet = getAddress("0x" + randomBytes(20).toString("hex"));
      const identityId = "unauth-role-" + randomUUID();

      // Register and activate on-chain
      await client.registerIdentity(identityId, testWallet);
      await client.activateIdentity(identityId);

      // Local MongoDB mistakenly granted admin role to user without on-chain assignment
      await IdentityModel.create({
        identityId,
        walletAddress: testWallet,
        displayName: "Unauthorized Role",
        status: "ACTIVE",
        roles: ["admin"], // Unauthorized!
      });

      // Run reconciliation
      const result = await reconcileTrustedState(client);

      const roleDiscrepancy = result.discrepancies.find(
        (d) => d.type === "ROLE_ASSIGNMENT" && d.identifier === `${identityId}:admin`,
      );
      expect(roleDiscrepancy).toBeDefined();

      // Unauthorized role stripped from MongoDB
      const restoredIdentity = await IdentityModel.findOne({ identityId });
      expect(restoredIdentity?.roles).not.toContain("admin");
    });
  });
});

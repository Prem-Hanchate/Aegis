import { Contract, getAddress, isAddress, isHexString, Log, type EventLog } from "ethers";
import mongoose from "mongoose";
import {
  BlockchainClient,
  blockchainDeviceId,
  blockchainIdentityId,
  blockchainPermissionId,
  blockchainRoleId,
} from "../../blockchain/client.js";
import { loadBlockchainConfig, type BlockchainConfig } from "../../blockchain/config.js";
import {
  BlockchainEventModel,
  BlockchainSyncStateModel,
  DeviceModel,
  IdentityModel,
  PolicyModel,
} from "../../models/index.js";
import {
  assignRoleAsync,
  getIdentity,
  removeRoleAsync,
  updateIdentityStatusAsync,
} from "../identity.service.js";
import { revokeDeviceDirectAsync } from "../device.service.js";
import { revokeSessionsForDeviceAsync, revokeSessionsForIdentityAsync } from "../session.service.js";
import { grantRolePermissionAsync, revokeRolePermissionAsync } from "../authorization/authorization.service.js";
import { reconcileTrustedState } from "./reconciliation.service.js";

// Known role names mapped to hashes
const knownRoles = new Map<string, string>([
  [blockchainRoleId("admin"), "admin"],
  [blockchainRoleId("manager"), "manager"],
  [blockchainRoleId("employee"), "employee"],
]);

// Known permission identifiers mapped to resource and action
const knownPermissions = new Map<string, { resource: string; action: string }>();

export function registerKnownRole(role: string) {
  knownRoles.set(blockchainRoleId(role), role);
}

export function registerKnownPermission(resource: string, action: string) {
  knownPermissions.set(blockchainPermissionId(resource, action), { resource, action });
}

// Prepopulate standard permissions
for (const [res, act] of [
  ["employee", "read"],
  ["reports", "read"],
  ["payroll", "read"],
  ["policies", "manage"],
] as const) {
  registerKnownPermission(res, act);
}

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export interface SyncOptions {
  confirmationsRequired?: number;
  fromBlock?: number;
  toBlock?: number;
}

export class BlockchainSyncService {
  private isListening = false;
  private activeListeners: Array<() => void> = [];

  constructor(
    private readonly client: BlockchainClient,
    private readonly config: BlockchainConfig = loadBlockchainConfig(),
  ) {}

  /**
   * Initializes or gets the synchronization state for a contract.
   */
  async getSyncState(contractName: string, contractAddress: string) {
    if (!isDbConnected()) return null;

    let state = await BlockchainSyncStateModel.findOne({
      chainId: Number(this.config.chainId),
      contractAddress: contractAddress.toLowerCase(),
    });

    if (!state) {
      state = await BlockchainSyncStateModel.create({
        chainId: Number(this.config.chainId),
        contractAddress: contractAddress.toLowerCase(),
        contractName,
        lastProcessedBlock: 0,
        lastProcessedBlockHash: "",
        lastProcessedEvent: "",
        status: "IDLE",
        pendingReconciliation: false,
        failedEvents: [],
      });
    }

    return state;
  }

  /**
   * Idempotently process a parsed blockchain event.
   */
  async processEvent(params: {
    contractName: string;
    contractAddress: string;
    eventName: string;
    blockNumber: number;
    blockHash: string;
    txHash: string;
    logIndex: number;
    args: Record<string, any>;
    confirmationsRequired?: number;
  }): Promise<{ processed: boolean; duplicate: boolean }> {
    const {
      contractName,
      contractAddress,
      eventName,
      blockNumber,
      blockHash,
      txHash,
      logIndex,
      args,
      confirmationsRequired = 1,
    } = params;

    const chainId = Number(this.config.chainId);
    const eventId = `${chainId}:${txHash}:${logIndex}`;

    // 1. Event Validation: check contract address & chain ID
    const normalizedContract = contractAddress.toLowerCase();
    const expectedAddresses = [
      this.config.identityRegistryAddress.toLowerCase(),
      this.config.policyRegistryAddress.toLowerCase(),
      this.config.revocationRegistryAddress.toLowerCase(),
      this.config.aegisRegistryAddress?.toLowerCase(),
    ].filter(Boolean);

    if (!expectedAddresses.includes(normalizedContract)) {
      throw new Error(`Event from unrecognized contract address: ${contractAddress}`);
    }

    // 2. Check confirmation depth if requested
    if (confirmationsRequired > 1) {
      const currentBlock = await this.client.getProvider().getBlockNumber();
      if (currentBlock - blockNumber + 1 < confirmationsRequired) {
        return { processed: false, duplicate: false };
      }
    }

    // 3. Deduplication: check if already processed
    if (isDbConnected()) {
      const existing = await BlockchainEventModel.findOne({ chainId, txHash, logIndex });
      if (existing) {
        return { processed: true, duplicate: true };
      }
    }

    // 4. Check for potential chain reorg against sync state
    if (isDbConnected()) {
      const state = await this.getSyncState(contractName, contractAddress);
      if (
        state &&
        state.lastProcessedBlock >= blockNumber &&
        state.lastProcessedBlockHash &&
        state.lastProcessedBlockHash !== blockHash
      ) {
        // Reorg detected at or before this block
        await this.handleReorg(contractName, contractAddress, blockNumber);
      }
    }

    // 5. Apply event to MongoDB trusted-state cache & backend state
    try {
      await this.applyEventState(eventName, args);

      // 6. Record event in MongoDB for idempotency
      if (isDbConnected()) {
        await BlockchainEventModel.create({
          eventId,
          chainId,
          contractAddress: normalizedContract,
          contractName,
          eventName,
          blockNumber,
          blockHash,
          txHash,
          logIndex,
          parameters: args,
          confirmed: true,
          confirmations: confirmationsRequired,
          processedAt: new Date(),
        });

        // 7. Update sync state
        await BlockchainSyncStateModel.updateOne(
          { chainId, contractAddress: normalizedContract },
          {
            $set: {
              lastProcessedBlock: blockNumber,
              lastProcessedBlockHash: blockHash,
              lastProcessedEvent: eventName,
              lastSyncTimestamp: new Date(),
              status: "IDLE",
            },
          },
        );
      }

      return { processed: true, duplicate: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Event processing failure";
      if (isDbConnected()) {
        await BlockchainSyncStateModel.updateOne(
          { chainId, contractAddress: normalizedContract },
          {
            $set: {
              status: "ERROR",
              lastError: errorMessage,
              pendingReconciliation: true,
            },
            $push: {
              failedEvents: {
                eventName,
                blockNumber,
                txHash,
                logIndex,
                error: errorMessage,
                timestamp: new Date(),
                payload: args,
              },
            },
          },
        );
      }
      throw error;
    }
  }

  /**
   * Applies the verified contract event to the trusted-state cache (MongoDB) and in-memory services.
   */
  private async applyEventState(eventName: string, args: Record<string, any>): Promise<void> {
    switch (eventName) {
      case "IdentityRegistered": {
        // args: { identityId, walletAddress, timestamp }
        const walletAddress = args.walletAddress ? getAddress(args.walletAddress) : "";
        if (walletAddress && isDbConnected()) {
          const existing = await IdentityModel.findOne({ walletAddress });
          if (!existing) {
            console.log(`[BlockchainSync] Identity registered on-chain for wallet ${walletAddress}`);
            const allInMemory = listIdentities();
            const matched = allInMemory.find((id) => blockchainIdentityId(id.identityId) === args.identityId || id.walletAddress === walletAddress);
            const actualId = matched?.identityId ?? args.identityId;
            const displayName = matched?.displayName ?? `Identity-${walletAddress.slice(0, 8)}`;
            await IdentityModel.create({
              identityId: actualId,
              walletAddress,
              displayName,
              status: "ACTIVE",
              roles: [],
            }).catch(() => {});
          }
        }
        break;
      }
      }

      case "IdentityActivated": {
        // args: { identityId, walletAddress, timestamp }
        const identity = await this.resolveIdentity(args.identityId, args.walletAddress);
        if (identity) {
          await updateIdentityStatusAsync(identity.identityId, "ACTIVE");
        }
        break;
      }

      case "IdentityRevoked": {
        // args: { identityId, walletAddress?, timestamp }
        const identity = await this.resolveIdentity(args.identityId, args.walletAddress);
        if (identity) {
          await updateIdentityStatusAsync(identity.identityId, "REVOKED");
          await revokeSessionsForIdentityAsync(identity.identityId);
        }
        break;
      }

      case "RoleCreated": {
        // args: { roleId, timestamp }
        const roleName = knownRoles.get(args.roleId);
        if (roleName && isDbConnected()) {
          const existing = await PolicyModel.findOne({ role: roleName });
          if (!existing) {
            await PolicyModel.create({ role: roleName, permissions: [], assignedIdentities: [] });
          }
        }
        break;
      }

      case "RoleAssigned": {
        // args: { identityId, roleId, timestamp }
        const identity = await this.resolveIdentity(args.identityId);
        const roleName = knownRoles.get(args.roleId);
        if (identity && roleName) {
          await assignRoleAsync(identity.identityId, roleName);
          // Reload in-memory permission store from MongoDB so any permissions
          // already granted to this role are immediately visible.
          if (isDbConnected()) {
            const { rehydratePolicyStore } = await import("../authorization/authorization.service.js");
            await rehydratePolicyStore();
          }
        }
        break;
      }

      case "RoleRemoved": {
        // args: { identityId, roleId, timestamp }
        const identity = await this.resolveIdentity(args.identityId);
        const roleName = knownRoles.get(args.roleId);
        if (identity && roleName) {
          await removeRoleAsync(identity.identityId, roleName);
        }
        break;
      }

      case "PermissionCreated": {
        if (!knownPermissions.has(args.permissionId) || isHexString(knownPermissions.get(args.permissionId)?.resource, 32)) {
          knownPermissions.set(args.permissionId, {
            resource: args.resource,
            action: args.action,
          });
        }
        break;
      }

      case "PermissionGranted": {
        // args: { roleId, permissionId, timestamp }
        const roleName = knownRoles.get(args.roleId);
        const permission = knownPermissions.get(args.permissionId);
        if (roleName && permission) {
          await grantRolePermissionAsync(roleName, permission.resource, permission.action);
        }
        break;
      }

      case "PermissionRevoked": {
        // args: { roleId?, permissionId, timestamp }
        const permission = knownPermissions.get(args.permissionId);
        if (permission) {
          if (args.roleId) {
            const roleName = knownRoles.get(args.roleId);
            if (roleName) {
              await revokeRolePermissionAsync(roleName, permission.resource, permission.action);
            }
          } else {
            // RevocationRegistry.PermissionRevoked: revoke for all roles
            for (const roleName of ["admin", "manager", "employee"]) {
              try {
                await revokeRolePermissionAsync(roleName, permission.resource, permission.action);
              } catch {
                // Ignore if not present in role
              }
            }
          }
        }
        break;
      }

      case "DeviceRevoked": {
                const device = await this.resolveDevice(args.deviceId);
                const targetDeviceId = device ? device.deviceId : args.deviceId;
                const res1 = await revokeDeviceDirectAsync(targetDeviceId);
                await revokeSessionsForDeviceAsync(targetDeviceId);
        break;
      }
      case "__DeviceRevokedOld": {
        // args: { deviceId, timestamp }
        const device = await this.resolveDevice(args.deviceId);
        const targetDeviceId = device ? device.deviceId : args.deviceId;
        await revokeDeviceDirectAsync(targetDeviceId);
        await revokeSessionsForDeviceAsync(targetDeviceId);
        break;
      }

      default:
        // Ignore unhandled / informational events (e.g. RegistryInitialized)
        break;
    }
  }

  /**
   * Resolves an Identity from either onChain identityId hash or wallet address.
   */
  private async resolveIdentity(onChainId: string, walletAddress?: string) {
    if (walletAddress && isAddress(walletAddress)) {
      const normalized = getAddress(walletAddress);
      if (isDbConnected()) {
        const found = await IdentityModel.findOne({ walletAddress: normalized });
        if (found) return found;
      }
      try {
        return getIdentity(normalized);
      } catch {
        // fallback
      }
    }

    if (isDbConnected()) {
      const all = await IdentityModel.find();
      for (const id of all) {
        if (blockchainIdentityId(id.identityId) === onChainId) {
          return id;
        }
      }
    }
    try {
      const allMemory = listIdentities();
      for (const id of allMemory) {
        if (blockchainIdentityId(id.identityId) === onChainId) {
          return id;
        }
      }
    } catch {}
    return null;
  }

  /**
   * Resolves a Device from deviceId or blockchain deviceId hash.
   */
  private async resolveDevice(onChainDeviceId: string) {
    if (isDbConnected()) {
      // 1. Direct deviceId match if stored as 32-byte hex
      const direct = await DeviceModel.findOne({ deviceId: onChainDeviceId });
      if (direct) return direct;

      // 2. Search all devices by hashed ID
      const all = await DeviceModel.find();
      for (const d of all) {
        if (blockchainDeviceId(d.deviceId) === onChainDeviceId) {
          return d;
        }
      }
    }
    return null;
  }

  /**
   * Handle blockchain reorganization: rollback unconfirmed/divergent state and flag for reconciliation.
   */
  async handleReorg(contractName: string, contractAddress: string, divergentBlockNumber: number): Promise<void> {
    const chainId = Number(this.config.chainId);
    const normalizedContract = contractAddress.toLowerCase();

    if (isDbConnected()) {
      // Delete derived events from the reorged block number onwards
      await BlockchainEventModel.deleteMany({
        chainId,
        contractAddress: normalizedContract,
        blockNumber: { $gte: divergentBlockNumber },
      });

      // Update sync state to mark pending reconciliation and step back block number
      await BlockchainSyncStateModel.updateOne(
        { chainId, contractAddress: normalizedContract },
        {
          $set: {
            lastProcessedBlock: Math.max(0, divergentBlockNumber - 1),
            lastProcessedBlockHash: "",
            status: "RECONCILING",
            pendingReconciliation: true,
          },
        },
      );
    }

    // Trigger reconciliation to restore state
    await reconcileTrustedState(this.client, this.config);
  }

  /**
   * Retrieve and sync events across a specific block range for missed events.
   */
  async syncBlockRange(fromBlock: number, toBlock: number, confirmationsRequired = 1): Promise<number> {
    const contracts = this.client.getContracts();
    const contractList = [
      { name: "IdentityRegistry", contract: contracts.identityRegistry, address: this.config.identityRegistryAddress },
      { name: "PolicyRegistry", contract: contracts.policyRegistry, address: this.config.policyRegistryAddress },
      { name: "RevocationRegistry", contract: contracts.revocationRegistry, address: this.config.revocationRegistryAddress },
    ];

    let totalProcessed = 0;

    for (const item of contractList) {
      if (isDbConnected()) {
        await BlockchainSyncStateModel.updateOne(
          { chainId: Number(this.config.chainId), contractAddress: item.address.toLowerCase() },
          { $set: { status: "SYNCING" } },
        );
      }

      // Query raw logs/events for the contract in the range
      const events = await item.contract.queryFilter("*", fromBlock, toBlock);
      if (events.length > 0) console.log(`[syncBlockRange] ${item.name} found ${events.length} events from ${fromBlock} to ${toBlock}:`, events.map(e => e.eventName));



      for (const event of events) {
        if ("args" in event && event.args) {
          const eventLog = event as EventLog;
          const parsedArgs: Record<string, any> = {};
          if (eventLog.fragment && eventLog.fragment.inputs) {
            eventLog.fragment.inputs.forEach((input, index) => {
              parsedArgs[input.name] = eventLog.args[index];
            });
          }
          for (const key of Object.keys(eventLog.args)) {
            if (isNaN(Number(key))) {
              parsedArgs[key] = eventLog.args[key];
            }
          }

          const result = await this.processEvent({
            contractName: item.name,
            contractAddress: item.address,
            eventName: eventLog.eventName,
            blockNumber: eventLog.blockNumber,
            blockHash: eventLog.blockHash,
            txHash: eventLog.transactionHash,
            logIndex: eventLog.index,
            args: parsedArgs,
            confirmationsRequired,
          });

          if (result.processed && !result.duplicate) {
            totalProcessed++;
          }
        }
      }

      // Update last processed block to toBlock if higher
      if (isDbConnected()) {
        const provider = this.client.getProvider();
        let blockHash = "";
        try {
          const block = await provider.getBlock(toBlock);
          blockHash = block?.hash ?? "";
        } catch {
          // ignore
        }

        await BlockchainSyncStateModel.updateOne(
          { chainId: Number(this.config.chainId), contractAddress: item.address.toLowerCase() },
          {
            $set: {
              lastProcessedBlock: toBlock,
              lastProcessedBlockHash: blockHash,
              status: "IDLE",
              lastSyncTimestamp: new Date(),
            },
          },
        );
      }
    }

    return totalProcessed;
  }

  /**
   * Catch up from last processed block to current block with required confirmation depth.
   */
  async syncLatest(confirmationsRequired = 1): Promise<number> {
    const provider = this.client.getProvider();
    let currentBlock: number;
    try {
      const hexBlock = await provider.send("eth_blockNumber", []);
      currentBlock = parseInt(hexBlock, 16);
    } catch {
      currentBlock = await provider.getBlockNumber();
    }
    const targetBlock = currentBlock - confirmationsRequired + 1;

    if (targetBlock < 0) return 0;

    let minLastProcessed = targetBlock;
    if (isDbConnected()) {
      const states = await BlockchainSyncStateModel.find({
        chainId: Number(this.config.chainId),
      });
      if (states.length > 0) {
        minLastProcessed = Math.min(...states.map((s) => s.lastProcessedBlock));
      } else {
        minLastProcessed = 0;
      }
    } else {
      minLastProcessed = 0;
    }

    console.log(`[syncLatest] currentBlock=${currentBlock}, targetBlock=${targetBlock}, minLastProcessed=${minLastProcessed}`);
    const fromBlock = minLastProcessed === 0 ? 0 : minLastProcessed + 1;
    if (fromBlock <= targetBlock) {
      return this.syncBlockRange(fromBlock, targetBlock, confirmationsRequired);
    }
    return 0;
  }

  /**
   * Start real-time event listeners on contracts.
   */
  startListeners(): void {
    if (this.isListening) return;
    this.isListening = true;

    const contracts = this.client.getContracts();
    const contractList = [
      { name: "IdentityRegistry", contract: contracts.identityRegistry, address: this.config.identityRegistryAddress },
      { name: "PolicyRegistry", contract: contracts.policyRegistry, address: this.config.policyRegistryAddress },
      { name: "RevocationRegistry", contract: contracts.revocationRegistry, address: this.config.revocationRegistryAddress },
    ];

    for (const item of contractList) {
      const listener = async (...eventArgs: any[]) => {
        const payload = eventArgs[eventArgs.length - 1];
        if (payload && typeof payload === "object" && "log" in payload) {
          const log = payload.log as EventLog;
          const parsedArgs: Record<string, any> = {};
          if (log.fragment && log.fragment.inputs) {
            log.fragment.inputs.forEach((input, index) => {
              parsedArgs[input.name] = log.args[index];
            });
          }
          if (payload.args) {
            for (const key of Object.keys(payload.args)) {
              if (isNaN(Number(key))) {
                parsedArgs[key] = payload.args[key];
              }
            }
          }

          try {
            await this.processEvent({
              contractName: item.name,
              contractAddress: item.address,
              eventName: payload.fragment?.name ?? "Unknown",
              blockNumber: log.blockNumber,
              blockHash: log.blockHash,
              txHash: log.transactionHash,
              logIndex: log.index,
              args: parsedArgs,
            });
          } catch (err) {
            console.error(`[BlockchainSync] Error processing event ${payload.fragment?.name}:`, err);
          }
        }
      };

      try {
        void item.contract.on("*", listener);
        this.activeListeners.push(() => {
          void item.contract.off("*", listener);
        });
      } catch (err) {
        console.error(`[BlockchainSync] Failed to attach listener for ${item.name}:`, err);
      }
    }
  }

  /**
   * Stop all active contract event listeners.
   */
  stopListeners(): void {
    this.isListening = false;
    for (const stop of this.activeListeners) {
      try {
        stop();
      } catch {
        // ignore
      }
    }
    this.activeListeners = [];
  }
}

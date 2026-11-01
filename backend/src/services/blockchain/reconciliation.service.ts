import { randomUUID } from "node:crypto";
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
  BlockchainSyncStateModel,
  DeviceModel,
  IdentityModel,
  PolicyModel,
  ReconciliationRecordModel,
} from "../../models/index.js";
import { removeRoleAsync, updateIdentityStatusAsync } from "../identity.service.js";
import { revokeDeviceDirectAsync } from "../device.service.js";
import { revokeSessionsForDeviceAsync, revokeSessionsForIdentityAsync } from "../session.service.js";
import { revokeRolePermissionAsync } from "../authorization/authorization.service.js";

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

let reconciliationIntervalTimer: NodeJS.Timeout | null = null;

export interface Discrepancy {
  type: "IDENTITY_STATUS" | "ROLE_ASSIGNMENT" | "PERMISSION_GRANT" | "DEVICE_REVOCATION" | "PERMISSION_REVOCATION";
  identifier: string;
  blockchainValue: any;
  cachedValue: any;
  actionTaken: string;
}

export interface ReconciliationResult {
  reconciliationId: string;
  timestamp: Date;
  chainId: number;
  status: "SUCCESS" | "DIFFERENCES_FOUND" | "FAILED";
  discrepanciesCount: number;
  discrepancies: Discrepancy[];
  restoredRecordsCount: number;
  durationMs: number;
  error?: string | null;
}

/**
 * Reconciles trusted-state cache in MongoDB against the authoritative blockchain state.
 */
export async function reconcileTrustedState(
  client: BlockchainClient,
  config: BlockchainConfig = loadBlockchainConfig(),
): Promise<ReconciliationResult> {
  const startTime = Date.now();
  const reconciliationId = randomUUID();
  const chainId = Number(config.chainId);
  const discrepancies: Discrepancy[] = [];
  let restoredCount = 0;

  try {
    // 1. Reconcile Identities
    if (isDbConnected()) {
      const identities = await IdentityModel.find();
      for (const identity of identities) {
        const onChainId = blockchainIdentityId(identity.identityId);

        let isRevokedOnChain = false;
        let isActiveOnChain = false;
        try {
          isRevokedOnChain = await client.isIdentityRevoked(identity.identityId);
          isActiveOnChain = await client.isIdentityActive(identity.identityId);
        } catch {
          // If contract call fails, do not falsely assume state
          continue;
        }

        // If revoked on-chain, MongoDB must NOT remain ACTIVE
        if (isRevokedOnChain && identity.status !== "REVOKED") {
          discrepancies.push({
            type: "IDENTITY_STATUS",
            identifier: identity.identityId,
            blockchainValue: "REVOKED",
            cachedValue: identity.status,
            actionTaken: "Updated identity status to REVOKED and revoked all active sessions",
          });
          await updateIdentityStatusAsync(identity.identityId, "REVOKED");
          await revokeSessionsForIdentityAsync(identity.identityId);
          restoredCount++;
        } else if (!isRevokedOnChain && !isActiveOnChain && identity.status === "ACTIVE") {
          // Identity registered but not active on chain, yet active in MongoDB
          discrepancies.push({
            type: "IDENTITY_STATUS",
            identifier: identity.identityId,
            blockchainValue: "INACTIVE",
            cachedValue: "ACTIVE",
            actionTaken: "Revoked active sessions due to unverified on-chain identity status",
          });
          await revokeSessionsForIdentityAsync(identity.identityId);
          restoredCount++;
        }

        // Reconcile assigned roles for this identity
        if (identity.roles && identity.roles.length > 0) {
          for (const role of [...identity.roles]) {
            try {
              const roleId = blockchainRoleId(role);
              const hasRoleOnChain = await client.hasRole(identity.identityId, roleId);
              if (!hasRoleOnChain) {
                discrepancies.push({
                  type: "ROLE_ASSIGNMENT",
                  identifier: `${identity.identityId}:${role}`,
                  blockchainValue: false,
                  cachedValue: true,
                  actionTaken: "Removed unauthorized role from identity",
                });
                await removeRoleAsync(identity.identityId, role);
                restoredCount++;
              }
            } catch {
              // Role check failed
            }
          }
        }
      }

      // 2. Reconcile Policies and Permissions
      const policies = await PolicyModel.find();
      for (const policy of policies) {
        const roleId = blockchainRoleId(policy.role);
        for (const permStr of [...policy.permissions]) {
          const colonIndex = permStr.indexOf(":");
          if (colonIndex === -1) continue;
          const resource = permStr.slice(0, colonIndex);
          const action = permStr.slice(colonIndex + 1);
          const permissionId = blockchainPermissionId(resource, action);

          try {
            const isPermRevoked = await client.isPermissionRevoked(permissionId);
            const hasPermForRole = await client.hasPermissionForRole(roleId, permissionId);

            if (isPermRevoked || !hasPermForRole) {
              discrepancies.push({
                type: "PERMISSION_GRANT",
                identifier: `${policy.role}:${permStr}`,
                blockchainValue: false,
                cachedValue: true,
                actionTaken: "Revoked unauthorized permission from role in MongoDB and authorization store",
              });
              await revokeRolePermissionAsync(policy.role, resource, action);
              restoredCount++;
            }
          } catch {
            // Permission check failed
          }
        }
      }

      // 3. Reconcile Active Devices
      const activeDevices = await DeviceModel.find({ status: "ACTIVE" });
      for (const device of activeDevices) {
        try {
          const isDeviceRevoked = await client.isDeviceRevoked(device.deviceId);
          if (isDeviceRevoked) {
            discrepancies.push({
              type: "DEVICE_REVOCATION",
              identifier: device.deviceId,
              blockchainValue: "REVOKED",
              cachedValue: "ACTIVE",
              actionTaken: "Revoked device in MongoDB and revoked associated sessions",
            });
            await revokeDeviceDirectAsync(device.deviceId);
            await revokeSessionsForDeviceAsync(device.deviceId);
            restoredCount++;
          }
        } catch {
          // Device check failed
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const status = discrepancies.length > 0 ? "DIFFERENCES_FOUND" : "SUCCESS";

    const record: ReconciliationResult = {
      reconciliationId,
      timestamp: new Date(),
      chainId,
      status,
      discrepanciesCount: discrepancies.length,
      discrepancies,
      restoredRecordsCount: restoredCount,
      durationMs,
      error: null,
    };

    if (isDbConnected()) {
      await ReconciliationRecordModel.create(record);
      // Clear pending reconciliation flag
      await BlockchainSyncStateModel.updateMany(
        { chainId },
        { $set: { pendingReconciliation: false, status: "IDLE" } },
      );
    }

    return record;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Reconciliation failure";

    const failureRecord: ReconciliationResult = {
      reconciliationId,
      timestamp: new Date(),
      chainId,
      status: "FAILED",
      discrepanciesCount: discrepancies.length,
      discrepancies,
      restoredRecordsCount: restoredCount,
      durationMs,
      error: errorMessage,
    };

    if (isDbConnected()) {
      try {
        await ReconciliationRecordModel.create(failureRecord);
      } catch {
        // ignore write error on failure
      }
    }

    return failureRecord;
  }
}

/**
 * Starts periodic trusted-state reconciliation.
 */
export function startPeriodicReconciliation(
  client: BlockchainClient,
  config = loadBlockchainConfig(),
  intervalMs = 30000,
): void {
  if (reconciliationIntervalTimer) return;
  reconciliationIntervalTimer = setInterval(() => {
    void reconcileTrustedState(client, config).catch((err) => {
      console.error("[BlockchainReconciliation] Periodic reconciliation failed:", err);
    });
  }, intervalMs);
}

/**
 * Stops periodic reconciliation timer.
 */
export function stopPeriodicReconciliation(): void {
  if (reconciliationIntervalTimer) {
    clearInterval(reconciliationIntervalTimer);
    reconciliationIntervalTimer = null;
  }
}


import { hasBlockchainConfiguration, loadBlockchainConfig, type BlockchainConfig } from "../../blockchain/config.js";
import { BlockchainClient } from "../../blockchain/client.js";
import { BlockchainSyncService } from "./sync.service.js";
import { startPeriodicReconciliation, stopPeriodicReconciliation } from "./reconciliation.service.js";

export interface BlockchainRuntimeStatus {
  configured: boolean;
  connected: boolean;
  chainId: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncError: string | null;
}

let client: BlockchainClient | null = null;
let syncService: BlockchainSyncService | null = null;
let config: BlockchainConfig | null = null;
let lastSyncAttemptAt: string | null = null;
let lastSyncError: string | null = null;

export async function startBlockchainRuntime(): Promise<void> {
  if (!hasBlockchainConfiguration()) return;

  lastSyncAttemptAt = new Date().toISOString();
  lastSyncError = null;
  try {
    config = loadBlockchainConfig();
    client = await BlockchainClient.connect(config);
    syncService = new BlockchainSyncService(client, config);
    await syncService.syncLatest(config.confirmations ?? 1);
    syncService.startListeners();
    startPeriodicReconciliation(client, config);
  } catch (error) {
    lastSyncError = error instanceof Error ? error.message : "Blockchain runtime initialization failed.";
    stopBlockchainRuntime();
    throw error;
  }
}

export function getBlockchainRuntimeStatus(): BlockchainRuntimeStatus {
  return {
    configured: hasBlockchainConfiguration(),
    connected: client !== null,
    chainId: config?.chainId.toString() ?? null,
    lastSyncAttemptAt,
    lastSyncError,
  };
}

export function stopBlockchainRuntime(): void {
  syncService?.stopListeners();
  stopPeriodicReconciliation();
  syncService = null;
  client = null;
  config = null;
}

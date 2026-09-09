import { AppError } from "../middleware/AppError.js";
import { BlockchainClient } from "../blockchain/client.js";
import { hasBlockchainConfiguration, loadBlockchainConfig } from "../blockchain/config.js";

let clientPromise: Promise<BlockchainClient> | null = null;

async function getClient() {
  if (!hasBlockchainConfiguration()) return null;
  if (!clientPromise) {
    try {
      const config = loadBlockchainConfig();
      if (!config.signerPrivateKey) {
        throw new Error("BACKEND_SIGNER_PRIVATE_KEY is required when blockchain writes are enabled.");
      }
      clientPromise = BlockchainClient.connect(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Blockchain configuration is invalid.";
      throw new AppError(message, 503, "BLOCKCHAIN_CONFIGURATION_INVALID");
    }
  }

  try {
    return await clientPromise;
  } catch (error) {
    clientPromise = null;
    const message = error instanceof Error ? error.message : "Blockchain connection failed.";
    throw new AppError(message, 503, "BLOCKCHAIN_UNAVAILABLE");
  }
}

export async function submitBlockchainWrite<T>(write: (client: BlockchainClient) => Promise<T>) {
  const client = await getClient();
  if (!client) return null;
  try {
    return await write(client);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : "Blockchain transaction failed.";
    throw new AppError(message, 502, "BLOCKCHAIN_TRANSACTION_FAILED");
  }
}

export function clearBlockchainClient() {
  clientPromise = null;
}
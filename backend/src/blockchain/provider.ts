import { JsonRpcProvider } from "ethers";
import type { BlockchainConfig } from "./config.js";

export function createBlockchainProvider(config: BlockchainConfig) {
  return new JsonRpcProvider(config.rpcUrl);
}
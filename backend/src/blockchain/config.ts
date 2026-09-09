import { getAddress } from "ethers";

export interface BlockchainConfig {
  rpcUrl: string;
  chainId: bigint;
  identityRegistryAddress: string;
  policyRegistryAddress: string;
  revocationRegistryAddress: string;
}

function requiredValue(source: NodeJS.ProcessEnv, name: string) {
  const value = source[name]?.trim();
  if (!value) {
    throw new Error(`Blockchain configuration is missing ${name}.`);
  }
  return value;
}

function parseAddress(source: NodeJS.ProcessEnv, name: string) {
  const value = requiredValue(source, name);
  try {
    return getAddress(value);
  } catch {
    throw new Error(`Blockchain configuration contains an invalid ${name}.`);
  }
}

export function loadBlockchainConfig(source: NodeJS.ProcessEnv = process.env): BlockchainConfig {
  const rpcUrl = requiredValue(source, "RPC_URL");
  let parsedRpcUrl: URL;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    throw new Error("Blockchain configuration contains an invalid RPC_URL.");
  }
  if (!parsedRpcUrl.protocol.startsWith("http")) {
    throw new Error("Blockchain configuration RPC_URL must use HTTP or HTTPS.");
  }

  const chainIdValue = requiredValue(source, "CHAIN_ID");
  if (!/^\d+$/.test(chainIdValue)) {
    throw new Error("Blockchain configuration contains an invalid CHAIN_ID.");
  }
  const chainId = BigInt(chainIdValue);
  if (chainId <= 0n) {
    throw new Error("Blockchain configuration CHAIN_ID must be positive.");
  }

  return {
    rpcUrl,
    chainId,
    identityRegistryAddress: parseAddress(source, "IDENTITY_REGISTRY_ADDRESS"),
    policyRegistryAddress: parseAddress(source, "POLICY_REGISTRY_ADDRESS"),
    revocationRegistryAddress: parseAddress(source, "REVOCATION_REGISTRY_ADDRESS"),
  };
}
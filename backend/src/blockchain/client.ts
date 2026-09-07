import { Contract, getAddress, isAddress, isHexString, keccak256, toUtf8Bytes } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { loadBlockchainConfig, type BlockchainConfig } from "./config.js";
import { createBlockchainContracts } from "./contracts.js";
import { createBlockchainProvider } from "./provider.js";

export interface BlockchainIdentity {
  walletAddress: string;
  status: bigint;
  createdAt: bigint;
  updatedAt: bigint;
  revokedAt: bigint;
}

function requireBytes32(value: string, name: string) {
  if (!isHexString(value, 32)) {
    throw new Error(`${name} must be a 32-byte hexadecimal value.`);
  }
  return value;
}

function identityIdForBackendId(identityId: string) {
  if (!identityId.trim()) {
    throw new Error("identityId must not be empty.");
  }
  return keccak256(toUtf8Bytes(`AegisIdentity:v1:${identityId}`));
}

export function blockchainIdentityId(identityId: string) {
  return identityIdForBackendId(identityId);
}

export function blockchainRoleId(role: string) {
  if (!role.trim()) throw new Error("role must not be empty.");
  return keccak256(toUtf8Bytes(`AegisRole:v1:${role}`));
}

export function blockchainPermissionId(resource: string, action: string) {
  if (!resource.trim() || !action.trim()) throw new Error("resource and action must not be empty.");
  return keccak256(toUtf8Bytes(`AegisPermission:v1:${resource}:${action}`));
}

export class BlockchainClient {
  private constructor(
    private readonly provider: JsonRpcProvider,
    private readonly config: BlockchainConfig,
    private readonly contracts: ReturnType<typeof createBlockchainContracts>,
  ) {}

  static async connect(config = loadBlockchainConfig(), provider = createBlockchainProvider(config)) {
    let network: { chainId: bigint };
    try {
      network = await provider.getNetwork();
    } catch {
      throw new Error(`Unable to connect to blockchain RPC at ${config.rpcUrl}.`);
    }
    if (network.chainId !== config.chainId) {
      throw new Error(`Blockchain chain ID mismatch. Expected: ${config.chainId}. Actual: ${network.chainId}.`);
    }

    for (const [name, address] of [
      ["IdentityRegistry", config.identityRegistryAddress],
      ["PolicyRegistry", config.policyRegistryAddress],
      ["RevocationRegistry", config.revocationRegistryAddress],
    ] as const) {
      try {
        const code = await provider.getCode(address);
        if (code === "0x") throw new Error(`No contract code found at ${name} address.`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("No contract code")) throw error;
        throw new Error(`Unable to verify ${name} contract at the configured address.`);
      }
    }

    return new BlockchainClient(provider, config, createBlockchainContracts(provider, config));
  }

  async getIdentity(identityId: string): Promise<BlockchainIdentity> {
    return this.contractCall("IdentityRegistry.getIdentity", () =>
      this.contracts.identityRegistry.getFunction("getIdentity")(identityIdForBackendId(identityId)),
    );
  }

  async getIdentityByWallet(walletAddress: string): Promise<{ identityId: string; identity: BlockchainIdentity }> {
    if (!isAddress(walletAddress)) throw new Error("walletAddress must be a valid Ethereum address.");
    const result = await this.contractCall("IdentityRegistry.getIdentityByWallet", () =>
      this.contracts.identityRegistry.getFunction("getIdentityByWallet")(getAddress(walletAddress)),
    );
    return { identityId: result[0], identity: result[1] as BlockchainIdentity };
  }

  async isIdentityActive(identityId: string) {
    return this.contractCall("IdentityRegistry.isActive", () =>
      this.contracts.identityRegistry.getFunction("isActive")(identityIdForBackendId(identityId)),
    );
  }

  async hasRole(identityId: string, roleId: string) {
    return this.contractCall("PolicyRegistry.hasIdentityRole", () =>
      this.contracts.policyRegistry.getFunction("hasIdentityRole")(
        identityIdForBackendId(identityId),
        requireBytes32(roleId, "roleId"),
      ),
    );
  }

  async hasPermission(identityId: string, permissionId: string) {
    return this.contractCall("PolicyRegistry.hasPermission", () =>
      this.contracts.policyRegistry.getFunction("hasPermission")(
        identityIdForBackendId(identityId),
        requireBytes32(permissionId, "permissionId"),
      ),
    );
  }

  async isIdentityRevoked(identityId: string) {
    return this.contractCall("RevocationRegistry.isIdentityRevoked", () =>
      this.contracts.revocationRegistry.getFunction("isIdentityRevoked")(identityIdForBackendId(identityId)),
    );
  }

  async isDeviceRevoked(deviceId: string) {
    return this.contractCall("RevocationRegistry.isDeviceRevoked", () =>
      this.contracts.revocationRegistry.getFunction("isDeviceRevoked")(requireBytes32(deviceId, "deviceId")),
    );
  }

  async isPermissionRevoked(permissionId: string) {
    return this.contractCall("RevocationRegistry.isPermissionRevoked", () =>
      this.contracts.revocationRegistry.getFunction("isPermissionRevoked")(requireBytes32(permissionId, "permissionId")),
    );
  }

  private async contractCall<T>(operation: string, call: () => Promise<T>) {
    try {
      return await call();
    } catch (error) {
      if (error instanceof Error && /must be|must not be|valid Ethereum/.test(error.message)) throw error;
      const message = error instanceof Error ? error.message : "Unknown contract call failure.";
      throw new Error(`Blockchain read failed for ${operation}: ${message}`);
    }
  }
}
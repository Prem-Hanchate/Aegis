import { Contract, getAddress, isAddress, isHexString, keccak256, NonceManager, toUtf8Bytes, Wallet } from "ethers";
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

export function blockchainDeviceId(deviceId: string) {
  if (!deviceId.trim()) throw new Error("deviceId must not be empty.");
  return isHexString(deviceId, 32) ? deviceId : keccak256(toUtf8Bytes(`AegisDevice:v1:${deviceId}`));
}

export function blockchainPermissionId(resource: string, action: string) {
  if (!resource.trim() || !action.trim()) throw new Error("resource and action must not be empty.");
  return keccak256(toUtf8Bytes(`AegisPermission:v1:${resource}:${action}`));
}

export interface BlockchainTransaction {
  operation: string;
  hash: string;
  status: "confirmed";
  blockNumber: number | null;
}

export class BlockchainClient {
  private constructor(
    private readonly provider: JsonRpcProvider,
    private readonly config: BlockchainConfig,
    private readonly contracts: ReturnType<typeof createBlockchainContracts>,
    private readonly signer: NonceManager | null,
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

    const checkContracts = [
      ["IdentityRegistry", config.identityRegistryAddress],
      ["PolicyRegistry", config.policyRegistryAddress],
      ["RevocationRegistry", config.revocationRegistryAddress],
    ] as [string, string][];

    if (config.auditRegistryAddress) {
      checkContracts.push(["AuditRegistry", config.auditRegistryAddress]);
    }

    for (const [name, address] of checkContracts) {
      try {
        const code = await provider.getCode(address);
        if (code === "0x") throw new Error(`No contract code found at ${name} address.`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("No contract code")) throw error;
        throw new Error(`Unable to verify ${name} contract at the configured address.`);
      }
    }

    let signer: NonceManager | null = null;
    if (config.signerPrivateKey) {
      try {
        signer = new NonceManager(new Wallet(config.signerPrivateKey, provider));
      } catch {
        throw new Error("Blockchain signer configuration is invalid.");
      }
    }
    return new BlockchainClient(provider, config, createBlockchainContracts(provider, config), signer);
  }

  getProvider(): JsonRpcProvider {
    return this.provider;
  }

  getConfig(): BlockchainConfig {
    return this.config;
  }

  getContracts() {
    return this.contracts;
  }

  getSigner(): NonceManager | null {
    return this.signer;
  }

  getSignerAddress(): Promise<string> | null {
    return this.signer ? this.signer.getAddress() : null;
  }

  async verifyTransactionReceipt(txHash: string, confirmations = this.config.confirmations ?? 1) {
    if (!isHexString(txHash, 32)) {
      throw new Error("txHash must be a 32-byte hexadecimal string.");
    }
    const receipt = await this.provider.waitForTransaction(txHash);
    if (!receipt) {
      return { verified: false, receipt: null, reason: "Receipt not found", confirmations: 0, requiredConfirmations: confirmations };
    }
    if (receipt.status !== 1) {
      return { verified: false, receipt, reason: "Transaction reverted", confirmations: 0, requiredConfirmations: confirmations };
    }
    const currentBlock = await this.provider.getBlockNumber();
    const confirmedCount = currentBlock - receipt.blockNumber + 1;
    if (confirmedCount < confirmations) {
      return {
        verified: false,
        receipt,
        confirmations: confirmedCount,
        requiredConfirmations: confirmations,
        reason: "Insufficient confirmations",
      };
    }
    return {
      verified: true,
      receipt,
      confirmations: confirmedCount,
      requiredConfirmations: confirmations,
    };
  }

  async revokePermission(permissionId: string) {
    return this.send("RevocationRegistry.revokePermission", this.contracts.revocationRegistry, "revokePermission", [
      requireBytes32(permissionId, "permissionId"),
    ]);
  }

  private async send(operation: string, contract: Contract, method: string, args: readonly unknown[]) {
    if (!this.signer) throw new Error("Blockchain signer is not configured for write operations.");

    try {
      const transaction = await contract.connect(this.signer).getFunction(method)(...args);
      const receipt = await transaction.wait(this.config.confirmations ?? 1);
      if (!receipt || receipt.status !== 1) throw new Error("Transaction was reverted.");
      return { operation, hash: receipt.hash, status: "confirmed" as const, blockNumber: receipt.blockNumber };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown transaction failure.";
      throw new Error(`Blockchain transaction failed for ${operation}: ${message}`);
    }
  }

  async registerIdentity(identityId: string, walletAddress: string) {
    if (!isAddress(walletAddress)) throw new Error("walletAddress must be a valid Ethereum address.");
    return this.send("IdentityRegistry.registerIdentity", this.contracts.identityRegistry, "registerIdentity", [identityIdForBackendId(identityId), getAddress(walletAddress)]);
  }

  async activateIdentity(identityId: string) {
    return this.send("IdentityRegistry.activateIdentity", this.contracts.identityRegistry, "activateIdentity", [identityIdForBackendId(identityId)]);
  }

  async revokeIdentity(identityId: string) {
    const identityTransaction = await this.send("IdentityRegistry.revokeIdentity", this.contracts.identityRegistry, "revokeIdentity", [identityIdForBackendId(identityId)]);
    const revocationTransaction = await this.send("RevocationRegistry.revokeIdentity", this.contracts.revocationRegistry, "revokeIdentity", [identityIdForBackendId(identityId)]);
    return { operation: "identity.revoke", status: "confirmed" as const, transactions: [identityTransaction, revocationTransaction] };
  }

  async assignRole(identityId: string, role: string) {
    const roleId = blockchainRoleId(role);
    const transactions = [];
    try {
      await this.contracts.policyRegistry.getFunction("getRole")(roleId);
    } catch {
      transactions.push(await this.send("PolicyRegistry.createRole", this.contracts.policyRegistry, "createRole", [roleId]));
    }
    transactions.push(await this.send("PolicyRegistry.assignRole", this.contracts.policyRegistry, "assignRole", [identityIdForBackendId(identityId), roleId]));
    return { operation: "identity.assignRole", status: "confirmed" as const, transactions };
  }

  async removeRole(identityId: string, role: string) {
    const roleId = blockchainRoleId(role);
    return this.send("PolicyRegistry.removeRole", this.contracts.policyRegistry, "removeRole", [
      identityIdForBackendId(identityId),
      roleId,
    ]);
  }

  async createPolicy(role: string, resource: string, action: string) {
    const roleId = blockchainRoleId(role);
    const permissionId = blockchainPermissionId(resource, action);
    const transactions = [];

    try {
      await this.contracts.policyRegistry.getFunction("getRole")(roleId);
    } catch {
      transactions.push(await this.send("PolicyRegistry.createRole", this.contracts.policyRegistry, "createRole", [roleId]));
    }

    try {
      await this.contracts.policyRegistry.getFunction("getPermission")(permissionId);
    } catch {
      transactions.push(
        await this.send("PolicyRegistry.createPermission", this.contracts.policyRegistry, "createPermission", [
          permissionId,
          keccak256(toUtf8Bytes(resource)),
          keccak256(toUtf8Bytes(action)),
        ]),
      );
    }

    const granted = await this.contracts.policyRegistry.getFunction("hasPermissionForRole")(roleId, permissionId);
    if (!granted) {
      transactions.push(
        await this.send("PolicyRegistry.grantPermissionToRole", this.contracts.policyRegistry, "grantPermissionToRole", [
          roleId,
          permissionId,
        ]),
      );
    }

    return { operation: "policy.create", status: "confirmed" as const, transactions };
  }

  async revokePolicy(role: string, resource: string, action: string) {
    return this.send("PolicyRegistry.revokePermissionFromRole", this.contracts.policyRegistry, "revokePermissionFromRole", [
      blockchainRoleId(role),
      blockchainPermissionId(resource, action),
    ]);
  }

  async revokeDevice(deviceId: string) {
    return this.send("RevocationRegistry.revokeDevice", this.contracts.revocationRegistry, "revokeDevice", [
      blockchainDeviceId(deviceId),
    ]);
  }

  async anchorAuditBatch(
    rootHash: string,
    batchSize: number,
    startTimestamp: number,
    endTimestamp: number,
    metadata = "",
  ) {
    if (!this.contracts.auditRegistry) {
      throw new Error("AuditRegistry contract is not configured.");
    }
    return this.send(
      "AuditRegistry.anchorBatch",
      this.contracts.auditRegistry,
      "anchorBatch",
      [
        requireBytes32(rootHash, "rootHash"),
        BigInt(batchSize),
        BigInt(startTimestamp),
        BigInt(endTimestamp),
        metadata,
      ],
    );
  }

  async getAuditBatch(batchId: number | bigint) {
    if (!this.contracts.auditRegistry) {
      throw new Error("AuditRegistry contract is not configured.");
    }
    return this.contractCall("AuditRegistry.getBatch", () =>
      this.contracts.auditRegistry!.getFunction("getBatch")(BigInt(batchId)),
    );
  }

  async latestAuditBatchId(): Promise<bigint> {
    if (!this.contracts.auditRegistry) {
      throw new Error("AuditRegistry contract is not configured.");
    }
    return this.contractCall("AuditRegistry.latestBatchId", () =>
      this.contracts.auditRegistry!.getFunction("latestBatchId")(),
    );
  }

  async verifyAuditProof(rootHash: string, leafHash: string, proof: string[]): Promise<boolean> {
    if (!this.contracts.auditRegistry) {
      throw new Error("AuditRegistry contract is not configured.");
    }
    return this.contractCall("AuditRegistry.verifyProof", () =>
      this.contracts.auditRegistry!.getFunction("verifyProof")(
        requireBytes32(rootHash, "rootHash"),
        requireBytes32(leafHash, "leafHash"),
        proof.map((p) => requireBytes32(p, "proofElement")),
      ),
    );
  }

  async getIdentity(identityId: string): Promise<BlockchainIdentity> {
    const result = await this.contractCall("IdentityRegistry.getIdentity", () =>
      this.contracts.identityRegistry.getFunction("getIdentity")(identityIdForBackendId(identityId)),
    );
    return result as BlockchainIdentity;
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
      this.contracts.revocationRegistry.getFunction("isDeviceRevoked")(blockchainDeviceId(deviceId)),
    );
  }

  async isPermissionRevoked(permissionId: string) {
    return this.contractCall("RevocationRegistry.isPermissionRevoked", () =>
      this.contracts.revocationRegistry.getFunction("isPermissionRevoked")(requireBytes32(permissionId, "permissionId")),
    );
  }

  async hasPermissionForRole(roleId: string, permissionId: string): Promise<boolean> {
    return this.contractCall("PolicyRegistry.hasPermissionForRole", () =>
      this.contracts.policyRegistry.getFunction("hasPermissionForRole")(
        requireBytes32(roleId, "roleId"),
        requireBytes32(permissionId, "permissionId"),
      ),
    );
  }

  async version(): Promise<string> {
    if (!this.contracts.aegisRegistry) {
      return "unknown";
    }
    return this.contractCall("AegisRegistry.version", () =>
      this.contracts.aegisRegistry!.getFunction("version")(),
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

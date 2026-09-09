import { ContractFactory, JsonRpcProvider, keccak256, toUtf8Bytes } from "ethers";
import { describe, expect, it } from "vitest";
import { BlockchainClient, blockchainIdentityId, blockchainPermissionId, blockchainRoleId } from "../src/blockchain/client.js";
import { loadBlockchainConfig, type BlockchainConfig } from "../src/blockchain/config.js";
import { loadArtifact } from "../src/blockchain/contracts.js";

const identityBackendId = "00000000-0000-4000-8000-000000000001";
const deviceId = "0x0000000000000000000000000000000000000000000000000000000000000002";
const validAddress = "0x0000000000000000000000000000000000000001";

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    RPC_URL: "http://127.0.0.1:8545",
    CHAIN_ID: "31337",
    IDENTITY_REGISTRY_ADDRESS: validAddress,
    POLICY_REGISTRY_ADDRESS: validAddress,
    REVOCATION_REGISTRY_ADDRESS: validAddress,
  };
}

function providerMock(chainId: bigint, code = "0x6000") {
  return {
    getNetwork: async () => ({ chainId }),
    getCode: async () => code,
  } as unknown as JsonRpcProvider;
}

describe("blockchain configuration", () => {
  it("requires RPC URL and all registry addresses", () => {
    const environment = validEnvironment();
    delete environment.RPC_URL;
    expect(() => loadBlockchainConfig(environment)).toThrow("RPC_URL");

    expect(() => loadBlockchainConfig(validEnvironment())).not.toThrow();
    const missingAddress = validEnvironment();
    delete missingAddress.IDENTITY_REGISTRY_ADDRESS;
    expect(() => loadBlockchainConfig(missingAddress)).toThrow("IDENTITY_REGISTRY_ADDRESS");
  });

  it("rejects invalid addresses and chain IDs", () => {
    const invalidAddress = validEnvironment();
    invalidAddress.POLICY_REGISTRY_ADDRESS = "not-an-address";
    expect(() => loadBlockchainConfig(invalidAddress)).toThrow("POLICY_REGISTRY_ADDRESS");

    const invalidChain = validEnvironment();
    invalidChain.CHAIN_ID = "not-a-chain";
    expect(() => loadBlockchainConfig(invalidChain)).toThrow("CHAIN_ID");
  });

  it("derives deterministic IDs using the contract conventions", () => {
    expect(blockchainIdentityId(identityBackendId)).to.equal(
      keccak256(toUtf8Bytes(`AegisIdentity:v1:${identityBackendId}`)),
    );
    expect(blockchainRoleId("EMPLOYEE")).to.equal(keccak256(toUtf8Bytes("AegisRole:v1:EMPLOYEE")));
    expect(blockchainPermissionId("employee", "read")).to.equal(
      keccak256(toUtf8Bytes("AegisPermission:v1:employee:read")),
    );
    expect(blockchainIdentityId(identityBackendId)).not.to.equal(identityBackendId);
  });

  it("fails initialization for a wrong chain or an address without bytecode", async () => {
    const config = loadBlockchainConfig(validEnvironment());
    await expect(BlockchainClient.connect(config, providerMock(1n))).rejects.toThrow("chain ID mismatch");
    await expect(BlockchainClient.connect(config, providerMock(31337n, "0x"))).rejects.toThrow(
      "No contract code found at IdentityRegistry address",
    );
  });
});

const integrationEnabled = process.env.RUN_BLOCKCHAIN_INTEGRATION_TESTS === "true";

describe.skipIf(!integrationEnabled)("blockchain client local integration", () => {
  it("reads IdentityRegistry, PolicyRegistry, and RevocationRegistry through ethers", async () => {
    const provider = new JsonRpcProvider("http://127.0.0.1:8545", 31337, { staticNetwork: true });
    const signer = await provider.getSigner(0);
    const adminAddress = await signer.getAddress();

    const identity: any = await new ContractFactory(loadArtifact("IdentityRegistry").abi, loadArtifact("IdentityRegistry").bytecode, signer).deploy(adminAddress);
    await identity.waitForDeployment();
    const policy: any = await new ContractFactory(loadArtifact("PolicyRegistry").abi, loadArtifact("PolicyRegistry").bytecode, signer).deploy(
      adminAddress,
      await identity.getAddress(),
    );
    await policy.waitForDeployment();
    const revocation: any = await new ContractFactory(loadArtifact("RevocationRegistry").abi, loadArtifact("RevocationRegistry").bytecode, signer).deploy(
      adminAddress,
    );
    await revocation.waitForDeployment();

    const config: BlockchainConfig = {
      rpcUrl: "http://127.0.0.1:8545",
      chainId: 31337n,
      identityRegistryAddress: await identity.getAddress(),
      policyRegistryAddress: await policy.getAddress(),
      revocationRegistryAddress: await revocation.getAddress(),
    };
    const client = await BlockchainClient.connect(config, provider);
    const walletAddress = await (await provider.getSigner(1)).getAddress();

    await identity.registerIdentity(blockchainIdentityId(identityBackendId), walletAddress);
    await identity.activateIdentity(blockchainIdentityId(identityBackendId));
    const employeeRole = blockchainRoleId("EMPLOYEE");
    const employeeRead = blockchainPermissionId("employee", "read");
    await policy.createRole(employeeRole);
    await policy.createPermission(employeeRead, "0x" + "00".repeat(31) + "01", "0x" + "00".repeat(31) + "02");
    await policy.grantPermissionToRole(employeeRole, employeeRead);
    await policy.assignRole(blockchainIdentityId(identityBackendId), employeeRole);

    expect((await client.getIdentity(identityBackendId)).walletAddress).to.equal(walletAddress);
    expect((await client.getIdentityByWallet(walletAddress)).identityId).to.equal(blockchainIdentityId(identityBackendId));
    expect(await client.isIdentityActive(identityBackendId)).to.equal(true);
    expect(await client.hasRole(identityBackendId, employeeRole)).to.equal(true);
    expect(await client.hasPermission(identityBackendId, employeeRead)).to.equal(true);
    expect(await client.isIdentityRevoked(identityBackendId)).to.equal(false);
    expect(await client.isDeviceRevoked(deviceId)).to.equal(false);
    expect(await client.isPermissionRevoked(employeeRead)).to.equal(false);

    await revocation.revokeDevice(deviceId);
    expect(await client.isDeviceRevoked(deviceId)).to.equal(true);
  });
});
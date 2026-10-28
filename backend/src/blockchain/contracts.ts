import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Contract } from "ethers";
import type { ContractRunner } from "ethers";
import type { BlockchainConfig } from "./config.js";

export interface HardhatArtifact {
  abi: readonly any[];
  bytecode: string;
}

export function loadArtifact(contractName: string): HardhatArtifact {
  const artifactUrl = new URL(
    `../../../contracts/artifacts/contracts/${contractName}.sol/${contractName}.json`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(fileURLToPath(artifactUrl), "utf8")) as HardhatArtifact;
}

export function createBlockchainContracts(provider: ContractRunner, config: BlockchainConfig) {
  return {
    identityRegistry: new Contract(
      config.identityRegistryAddress,
      loadArtifact("IdentityRegistry").abi,
      provider,
    ),
    policyRegistry: new Contract(config.policyRegistryAddress, loadArtifact("PolicyRegistry").abi, provider),
    revocationRegistry: new Contract(
      config.revocationRegistryAddress,
      loadArtifact("RevocationRegistry").abi,
      provider,
    ),
  };
}
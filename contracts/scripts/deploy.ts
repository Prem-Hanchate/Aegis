import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const aegisRegistryFactory = await ethers.getContractFactory("AegisRegistry");
  const aegisRegistry = await aegisRegistryFactory.deploy(deployer.address);
  await aegisRegistry.waitForDeployment();

  const identityRegistryFactory = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await identityRegistryFactory.deploy(deployer.address);
  await identityRegistry.waitForDeployment();

  console.log(`AegisRegistry deployed to ${await aegisRegistry.getAddress()}`);
  console.log(`IdentityRegistry deployed to ${await identityRegistry.getAddress()}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

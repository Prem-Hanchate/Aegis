import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("AegisRegistry");
  const contract = await factory.deploy(deployer.address);
  await contract.waitForDeployment();

  console.log(`AegisRegistry deployed to ${await contract.getAddress()}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

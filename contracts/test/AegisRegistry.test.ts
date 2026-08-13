import { expect } from "chai";
import { ethers } from "hardhat";

describe("AegisRegistry", function () {
  it("deploys and exposes the current version", async function () {
    const [owner] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("AegisRegistry");
    const contract = await factory.deploy(owner.address);

    await contract.waitForDeployment();

    expect(await contract.version()).to.equal("0.1.0");
    expect(await contract.owner()).to.equal(owner.address);
  });
});

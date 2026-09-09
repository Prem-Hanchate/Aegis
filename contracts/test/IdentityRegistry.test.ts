import { expect } from "chai";
import { ethers } from "hardhat";
import type { ContractTransactionReceipt } from "ethers";

const ZERO_ID = ethers.ZeroHash;

async function deployRegistry() {
  const [admin, other, wallet] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("IdentityRegistry");
  const registry = await factory.deploy(admin.address);
  await registry.waitForDeployment();
  return { registry, admin, other, wallet };
}

function eventFrom(receipt: ContractTransactionReceipt, registry: any, eventName: string) {
  const log = receipt.logs
    .map((entry) => {
      try {
        return registry.interface.parseLog({ topics: entry.topics as string[], data: entry.data });
      } catch {
        return null;
      }
    })
    .find((event: any) => event?.name === eventName);

  expect(log, `Expected ${eventName} event`).to.not.equal(undefined);
  return log;
}

async function expectCustomError(action: Promise<unknown>, errorName: string) {
  try {
    await action;
    expect.fail(`Expected ${errorName} custom error`);
  } catch (error: any) {
    expect(error.message).to.include(errorName);
  }
}

describe("IdentityRegistry", function () {
  it("deploys with the initial administrator assigned both roles", async function () {
    const { registry, admin } = await deployRegistry();

    expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    expect(await registry.hasRole(await registry.IDENTITY_ADMIN_ROLE(), admin.address)).to.equal(true);
  });

  it("registers an identity with an initial NONE status", async function () {
    const { registry, wallet } = await deployRegistry();
    const identityId = ethers.id("identity-1");
    const before = await ethers.provider.getBlock("latest");

    const transaction = await registry.registerIdentity(identityId, wallet.address);
    const receipt = await transaction.wait();
    const identity = await registry.getIdentity(identityId);
    const event = eventFrom(receipt!, registry, "IdentityRegistered");

    expect(identity.walletAddress).to.equal(wallet.address);
    expect(identity.status).to.equal(0n);
    expect(identity.createdAt >= BigInt(before!.timestamp)).to.equal(true);
    expect(identity.updatedAt).to.equal(identity.createdAt);
    expect(identity.revokedAt).to.equal(0n);
    expect(event.args.identityId).to.equal(identityId);
    expect(event.args.walletAddress).to.equal(wallet.address);
    expect(event.args.timestamp).to.equal(identity.createdAt);

    const lookup = await registry.getIdentityByWallet(wallet.address);
    expect(lookup[0]).to.equal(identityId);
    expect(lookup[1].walletAddress).to.equal(wallet.address);
  });

  it("activates a registered identity", async function () {
    const { registry, wallet } = await deployRegistry();
    const identityId = ethers.id("identity-1");
    await registry.registerIdentity(identityId, wallet.address);
    const before = await registry.getIdentity(identityId);

    const transaction = await registry.activateIdentity(identityId);
    const receipt = await transaction.wait();
    const identity = await registry.getIdentity(identityId);
    const event = eventFrom(receipt!, registry, "IdentityActivated");

    expect(identity.status).to.equal(1n);
    expect(identity.updatedAt >= before.updatedAt).to.equal(true);
    expect(identity.revokedAt).to.equal(0n);
    expect(event.args.identityId).to.equal(identityId);
    expect(event.args.walletAddress).to.equal(wallet.address);
    expect(event.args.timestamp).to.equal(identity.updatedAt);
    expect(await registry.isActive(identityId)).to.equal(true);
  });

  it("revokes an active identity without deleting its record or wallet mapping", async function () {
    const { registry, wallet } = await deployRegistry();
    const identityId = ethers.id("identity-1");
    await registry.registerIdentity(identityId, wallet.address);
    await registry.activateIdentity(identityId);
    const before = await registry.getIdentity(identityId);

    const transaction = await registry.revokeIdentity(identityId);
    const receipt = await transaction.wait();
    const identity = await registry.getIdentity(identityId);
    const event = eventFrom(receipt!, registry, "IdentityRevoked");
    const lookup = await registry.getIdentityByWallet(wallet.address);

    expect(identity.status).to.equal(2n);
    expect(identity.updatedAt >= before.updatedAt).to.equal(true);
    expect(identity.revokedAt).to.equal(identity.updatedAt);
    expect(event.args.identityId).to.equal(identityId);
    expect(event.args.walletAddress).to.equal(wallet.address);
    expect(event.args.timestamp).to.equal(identity.revokedAt);
    expect(lookup[0]).to.equal(identityId);
    expect(await registry.isActive(identityId)).to.equal(false);
  });

  it("returns false for unknown and non-active identities", async function () {
    const { registry, wallet } = await deployRegistry();
    const identityId = ethers.id("identity-1");

    expect(await registry.isActive(ZERO_ID)).to.equal(false);
    expect(await registry.isActive(identityId)).to.equal(false);
    await registry.registerIdentity(identityId, wallet.address);
    expect(await registry.isActive(identityId)).to.equal(false);
    await registry.activateIdentity(identityId);
    expect(await registry.isActive(identityId)).to.equal(true);
    await registry.revokeIdentity(identityId);
    expect(await registry.isActive(identityId)).to.equal(false);
  });

  it("rejects unauthorized lifecycle operations", async function () {
    const { registry, other, wallet } = await deployRegistry();
    const identityId = ethers.id("identity-1");

    await expectCustomError(
      registry.connect(other).registerIdentity(identityId, wallet.address),
      "AccessControlUnauthorizedAccount"
    );
    await registry.registerIdentity(identityId, wallet.address);
    await expectCustomError(
      registry.connect(other).activateIdentity(identityId),
      "AccessControlUnauthorizedAccount"
    );
    await registry.activateIdentity(identityId);
    await expectCustomError(
      registry.connect(other).revokeIdentity(identityId),
      "AccessControlUnauthorizedAccount"
    );
  });

  it("rejects invalid registration inputs and duplicates", async function () {
    const { registry, wallet } = await deployRegistry();
    const identityId = ethers.id("identity-1");

    await expectCustomError(registry.registerIdentity(ZERO_ID, wallet.address), "InvalidIdentityId");
    await expectCustomError(registry.registerIdentity(identityId, ethers.ZeroAddress), "InvalidWalletAddress");
    await registry.registerIdentity(identityId, wallet.address);
    await expectCustomError(
      registry.registerIdentity(identityId, await (await ethers.getSigners())[2].getAddress()),
      "IdentityAlreadyExists"
    );
    await expectCustomError(
      registry.registerIdentity(ethers.id("identity-2"), wallet.address),
      "WalletAlreadyRegistered"
    );
  });

  it("rejects unknown identities and wallets", async function () {
    const { registry, wallet } = await deployRegistry();
    const identityId = ethers.id("identity-1");

    await expectCustomError(registry.getIdentity(identityId), "IdentityNotFound");
    await expectCustomError(registry.getIdentityByWallet(wallet.address), "IdentityNotFound");
    await expectCustomError(registry.getIdentityByWallet(ethers.ZeroAddress), "InvalidWalletAddress");
    await expectCustomError(registry.activateIdentity(identityId), "IdentityNotFound");
    await expectCustomError(registry.revokeIdentity(identityId), "IdentityNotFound");
  });

  it("rejects invalid lifecycle transitions", async function () {
    const { registry, wallet } = await deployRegistry();
    const identityId = ethers.id("identity-1");
    await registry.registerIdentity(identityId, wallet.address);

    await expectCustomError(registry.revokeIdentity(identityId), "InvalidStatusTransition");
    await registry.activateIdentity(identityId);
    await expectCustomError(registry.activateIdentity(identityId), "InvalidStatusTransition");
    await registry.revokeIdentity(identityId);
    await expectCustomError(registry.activateIdentity(identityId), "InvalidStatusTransition");
    await expectCustomError(registry.revokeIdentity(identityId), "InvalidStatusTransition");
    await expectCustomError(
      registry.registerIdentity(identityId, await (await ethers.getSigners())[2].getAddress()),
      "IdentityAlreadyExists"
    );
  });
});

import { expect } from "chai";
import { ethers } from "hardhat";
import type { ContractTransactionReceipt } from "ethers";

const IDENTITY_ID = ethers.id("identity-alice");
const DEVICE_ID = ethers.id("device-alice");
const PERMISSION_ID = ethers.keccak256(ethers.toUtf8Bytes("AegisPermission:v1:employee:read"));

function eventFrom(receipt: ContractTransactionReceipt, contract: any, eventName: string) {
  const event = receipt.logs
    .map((entry) => {
      try {
        return contract.interface.parseLog({ topics: entry.topics as string[], data: entry.data });
      } catch {
        return null;
      }
    })
    .find((parsed: any) => parsed?.name === eventName);

  expect(event, `Expected ${eventName} event`).to.not.equal(undefined);
  return event;
}

async function expectCustomError(action: Promise<unknown>, errorName: string) {
  try {
    await action;
    expect.fail(`Expected ${errorName} custom error`);
  } catch (error: any) {
    expect(error.message).to.include(errorName);
  }
}

async function deployRegistry() {
  const [admin, other, wallet] = await ethers.getSigners();
  const identityFactory = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await identityFactory.deploy(admin.address);
  await identityRegistry.waitForDeployment();

  const revocationFactory = await ethers.getContractFactory("RevocationRegistry");
  const revocationRegistry = await revocationFactory.deploy(admin.address);
  await revocationRegistry.waitForDeployment();

  return { admin, other, wallet, identityRegistry, revocationRegistry };
}

describe("RevocationRegistry", function () {
  it("deploys with both administrator roles assigned", async function () {
    const { admin, revocationRegistry } = await deployRegistry();

    expect(await revocationRegistry.hasRole(await revocationRegistry.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    expect(await revocationRegistry.hasRole(await revocationRegistry.REVOCATION_ADMIN_ROLE(), admin.address)).to.equal(true);
  });

  it("records identity revocation with a timestamp and event", async function () {
    const { revocationRegistry } = await deployRegistry();
    const transaction = await revocationRegistry.revokeIdentity(IDENTITY_ID);
    const receipt = await transaction.wait();
    const record = await revocationRegistry.getIdentityRevocation(IDENTITY_ID);
    const event = eventFrom(receipt!, revocationRegistry, "IdentityRevoked");

    expect(await revocationRegistry.isIdentityRevoked(IDENTITY_ID)).to.equal(true);
    expect(record.revoked).to.equal(true);
    expect(record.revokedAt > 0n).to.equal(true);
    expect(event.args.identityId).to.equal(IDENTITY_ID);
    expect(event.args.timestamp).to.equal(record.revokedAt);
    await expectCustomError(revocationRegistry.revokeIdentity(IDENTITY_ID), "IdentityAlreadyRevoked");
  });

  it("records device revocation independently", async function () {
    const { revocationRegistry } = await deployRegistry();
    const transaction = await revocationRegistry.revokeDevice(DEVICE_ID);
    const receipt = await transaction.wait();
    const record = await revocationRegistry.getDeviceRevocation(DEVICE_ID);
    const event = eventFrom(receipt!, revocationRegistry, "DeviceRevoked");

    expect(await revocationRegistry.isDeviceRevoked(DEVICE_ID)).to.equal(true);
    expect(record.revoked).to.equal(true);
    expect(event.args.deviceId).to.equal(DEVICE_ID);
    expect(event.args.timestamp).to.equal(record.revokedAt);
    expect(await revocationRegistry.isIdentityRevoked(IDENTITY_ID)).to.equal(false);
    expect(await revocationRegistry.isPermissionRevoked(PERMISSION_ID)).to.equal(false);
    await expectCustomError(revocationRegistry.revokeDevice(DEVICE_ID), "DeviceAlreadyRevoked");
  });

  it("records permission revocation independently", async function () {
    const { revocationRegistry } = await deployRegistry();
    const transaction = await revocationRegistry.revokePermission(PERMISSION_ID);
    const receipt = await transaction.wait();
    const record = await revocationRegistry.getPermissionRevocation(PERMISSION_ID);
    const event = eventFrom(receipt!, revocationRegistry, "PermissionRevoked");

    expect(await revocationRegistry.isPermissionRevoked(PERMISSION_ID)).to.equal(true);
    expect(record.revoked).to.equal(true);
    expect(event.args.permissionId).to.equal(PERMISSION_ID);
    expect(event.args.timestamp).to.equal(record.revokedAt);
    expect(await revocationRegistry.isIdentityRevoked(IDENTITY_ID)).to.equal(false);
    expect(await revocationRegistry.isDeviceRevoked(DEVICE_ID)).to.equal(false);
    await expectCustomError(revocationRegistry.revokePermission(PERMISSION_ID), "PermissionAlreadyRevoked");
  });

  it("rejects zero identifiers and unauthorized operations without changing state", async function () {
    const { other, revocationRegistry } = await deployRegistry();

    await expectCustomError(revocationRegistry.revokeIdentity(ethers.ZeroHash), "InvalidIdentityId");
    await expectCustomError(revocationRegistry.revokeDevice(ethers.ZeroHash), "InvalidDeviceId");
    await expectCustomError(revocationRegistry.revokePermission(ethers.ZeroHash), "InvalidPermissionId");
    await expectCustomError(
      revocationRegistry.connect(other).revokeIdentity(IDENTITY_ID),
      "AccessControlUnauthorizedAccount"
    );
    await expectCustomError(
      revocationRegistry.connect(other).revokeDevice(DEVICE_ID),
      "AccessControlUnauthorizedAccount"
    );
    await expectCustomError(
      revocationRegistry.connect(other).revokePermission(PERMISSION_ID),
      "AccessControlUnauthorizedAccount"
    );

    expect(await revocationRegistry.isIdentityRevoked(IDENTITY_ID)).to.equal(false);
    expect(await revocationRegistry.isDeviceRevoked(DEVICE_ID)).to.equal(false);
    expect(await revocationRegistry.isPermissionRevoked(PERMISSION_ID)).to.equal(false);
  });

  it("uses the same identity ID without taking ownership of identity lifecycle", async function () {
    const { identityRegistry, wallet, revocationRegistry } = await deployRegistry();
    await identityRegistry.registerIdentity(IDENTITY_ID, wallet.address);
    await identityRegistry.activateIdentity(IDENTITY_ID);

    await revocationRegistry.revokeIdentity(IDENTITY_ID);

    expect(await identityRegistry.isActive(IDENTITY_ID)).to.equal(true);
    expect(await revocationRegistry.isIdentityRevoked(IDENTITY_ID)).to.equal(true);
  });
});
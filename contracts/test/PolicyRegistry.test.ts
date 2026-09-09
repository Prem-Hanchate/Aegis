import { expect } from "chai";
import { ethers } from "hardhat";
import type { ContractTransactionReceipt } from "ethers";

const EMPLOYEE = ethers.keccak256(ethers.toUtf8Bytes("AegisRole:v1:EMPLOYEE"));
const MANAGER = ethers.keccak256(ethers.toUtf8Bytes("AegisRole:v1:MANAGER"));
const ADMIN = ethers.keccak256(ethers.toUtf8Bytes("AegisRole:v1:ADMIN"));
const EMPLOYEE_READ = ethers.keccak256(ethers.toUtf8Bytes("AegisPermission:v1:employee:read"));
const REPORTS_READ = ethers.keccak256(ethers.toUtf8Bytes("AegisPermission:v1:reports:read"));
const PAYROLL_READ = ethers.keccak256(ethers.toUtf8Bytes("AegisPermission:v1:payroll:read"));
const POLICIES_MANAGE = ethers.keccak256(ethers.toUtf8Bytes("AegisPermission:v1:policies:manage"));

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

async function deployPolicy() {
  const [admin, other, aliceWallet, bobWallet, adminWallet] = await ethers.getSigners();
  const identityFactory = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await identityFactory.deploy(admin.address);
  await identityRegistry.waitForDeployment();

  const policyFactory = await ethers.getContractFactory("PolicyRegistry");
  const policyRegistry = await policyFactory.deploy(admin.address, await identityRegistry.getAddress());
  await policyRegistry.waitForDeployment();

  const identities = {
    alice: ethers.id("identity-alice"),
    bob: ethers.id("identity-bob"),
    policyAdmin: ethers.id("identity-admin")
  };
  await identityRegistry.registerIdentity(identities.alice, aliceWallet.address);
  await identityRegistry.registerIdentity(identities.bob, bobWallet.address);
  await identityRegistry.registerIdentity(identities.policyAdmin, adminWallet.address);
  await identityRegistry.activateIdentity(identities.alice);
  await identityRegistry.activateIdentity(identities.bob);
  await identityRegistry.activateIdentity(identities.policyAdmin);

  return { admin, other, identityRegistry, policyRegistry, identities };
}

async function configureMvp(policyRegistry: any) {
  await policyRegistry.createRole(EMPLOYEE);
  await policyRegistry.createRole(MANAGER);
  await policyRegistry.createRole(ADMIN);
  await policyRegistry.createPermission(EMPLOYEE_READ, ethers.id("employee"), ethers.id("read"));
  await policyRegistry.createPermission(REPORTS_READ, ethers.id("reports"), ethers.id("read"));
  await policyRegistry.createPermission(PAYROLL_READ, ethers.id("payroll"), ethers.id("read"));
  await policyRegistry.createPermission(POLICIES_MANAGE, ethers.id("policies"), ethers.id("manage"));

  for (const permission of [EMPLOYEE_READ, REPORTS_READ]) {
    await policyRegistry.grantPermissionToRole(EMPLOYEE, permission);
    await policyRegistry.grantPermissionToRole(MANAGER, permission);
    await policyRegistry.grantPermissionToRole(ADMIN, permission);
  }
  await policyRegistry.grantPermissionToRole(MANAGER, PAYROLL_READ);
  await policyRegistry.grantPermissionToRole(ADMIN, PAYROLL_READ);
  await policyRegistry.grantPermissionToRole(ADMIN, POLICIES_MANAGE);
}

describe("PolicyRegistry", function () {
  it("initializes policy administration and creates roles and permissions", async function () {
    const { admin, policyRegistry } = await deployPolicy();

    expect(await policyRegistry.hasRole(await policyRegistry.POLICY_ADMIN_ROLE(), admin.address)).to.equal(true);
    const roleTx = await policyRegistry.createRole(EMPLOYEE);
    const permissionTx = await policyRegistry.createPermission(
      EMPLOYEE_READ,
      ethers.id("employee"),
      ethers.id("read")
    );
    const role = await policyRegistry.getRole(EMPLOYEE);
    const permission = await policyRegistry.getPermission(EMPLOYEE_READ);

    expect(role.roleId).to.equal(EMPLOYEE);
    expect(role.exists).to.equal(true);
    expect(permission.permissionId).to.equal(EMPLOYEE_READ);
    expect(permission.resource).to.equal(ethers.id("employee"));
    expect(permission.action).to.equal(ethers.id("read"));
    expect(eventFrom(await roleTx.wait(), policyRegistry, "RoleCreated").args.roleId).to.equal(EMPLOYEE);
    expect(eventFrom(await permissionTx.wait(), policyRegistry, "PermissionCreated").args.permissionId).to.equal(
      EMPLOYEE_READ
    );
    await expectCustomError(policyRegistry.createRole(EMPLOYEE), "RoleAlreadyExists");
    await expectCustomError(
      policyRegistry.createPermission(EMPLOYEE_READ, ethers.id("employee"), ethers.id("read")),
      "PermissionAlreadyExists"
    );
    await expectCustomError(policyRegistry.grantPermissionToRole(ethers.id("unknown"), EMPLOYEE_READ), "RoleNotFound");
  });

  it("configures and evaluates the MVP role-permission matrix", async function () {
    const { policyRegistry, identities } = await deployPolicy();
    await configureMvp(policyRegistry);

    expect(await policyRegistry.hasPermissionForRole(EMPLOYEE, EMPLOYEE_READ)).to.equal(true);
    expect(await policyRegistry.hasPermissionForRole(EMPLOYEE, REPORTS_READ)).to.equal(true);
    expect(await policyRegistry.hasPermissionForRole(EMPLOYEE, PAYROLL_READ)).to.equal(false);
    expect(await policyRegistry.hasPermissionForRole(MANAGER, PAYROLL_READ)).to.equal(true);
    expect(await policyRegistry.hasPermissionForRole(ADMIN, POLICIES_MANAGE)).to.equal(true);

    await policyRegistry.assignRole(identities.alice, EMPLOYEE);
    await policyRegistry.assignRole(identities.bob, MANAGER);
    await policyRegistry.assignRole(identities.policyAdmin, ADMIN);
    expect(await policyRegistry.hasPermission(identities.alice, EMPLOYEE_READ)).to.equal(true);
    expect(await policyRegistry.hasPermission(identities.alice, PAYROLL_READ)).to.equal(false);
    expect(await policyRegistry.hasPermission(identities.bob, PAYROLL_READ)).to.equal(true);
    expect(await policyRegistry.hasPermission(identities.policyAdmin, POLICIES_MANAGE)).to.equal(true);
  });

  it("emits grant, revoke, assignment, and removal events", async function () {
    const { policyRegistry, identities } = await deployPolicy();
    await policyRegistry.createRole(EMPLOYEE);
    await policyRegistry.createPermission(EMPLOYEE_READ, ethers.id("employee"), ethers.id("read"));

    const grant = await policyRegistry.grantPermissionToRole(EMPLOYEE, EMPLOYEE_READ);
    expect(eventFrom(await grant.wait(), policyRegistry, "PermissionGranted").args.roleId).to.equal(EMPLOYEE);
    const revoke = await policyRegistry.revokePermissionFromRole(EMPLOYEE, EMPLOYEE_READ);
    expect(eventFrom(await revoke.wait(), policyRegistry, "PermissionRevoked").args.permissionId).to.equal(EMPLOYEE_READ);
    await policyRegistry.grantPermissionToRole(EMPLOYEE, EMPLOYEE_READ);
    const assignment = await policyRegistry.assignRole(identities.alice, EMPLOYEE);
    expect(eventFrom(await assignment.wait(), policyRegistry, "RoleAssigned").args.identityId).to.equal(identities.alice);
    const removal = await policyRegistry.removeRole(identities.alice, EMPLOYEE);
    expect(eventFrom(await removal.wait(), policyRegistry, "RoleRemoved").args.roleId).to.equal(EMPLOYEE);
  });

  it("rejects duplicate, unknown, and unauthorized policy operations", async function () {
    const { admin, other, identityRegistry, policyRegistry, identities } = await deployPolicy();
    await configureMvp(policyRegistry);

    await expectCustomError(policyRegistry.connect(other).createRole(ethers.id("other")), "AccessControlUnauthorizedAccount");
    await expectCustomError(
      policyRegistry.connect(other).createPermission(ethers.id("other"), ethers.id("x"), ethers.id("y")),
      "AccessControlUnauthorizedAccount"
    );
    await expectCustomError(
      policyRegistry.connect(other).grantPermissionToRole(EMPLOYEE, EMPLOYEE_READ),
      "AccessControlUnauthorizedAccount"
    );
    await expectCustomError(
      policyRegistry.connect(other).revokePermissionFromRole(EMPLOYEE, EMPLOYEE_READ),
      "AccessControlUnauthorizedAccount"
    );
    await expectCustomError(
      policyRegistry.connect(other).assignRole(identities.alice, EMPLOYEE),
      "AccessControlUnauthorizedAccount"
    );
    await expectCustomError(
      policyRegistry.connect(other).removeRole(identities.alice, EMPLOYEE),
      "AccessControlUnauthorizedAccount"
    );

    await expectCustomError(policyRegistry.grantPermissionToRole(EMPLOYEE, ethers.id("unknown")), "PermissionNotFound");
    await expectCustomError(policyRegistry.revokePermissionFromRole(EMPLOYEE, EMPLOYEE_READ), "PermissionNotGranted");
    await policyRegistry.grantPermissionToRole(EMPLOYEE, EMPLOYEE_READ);
    await expectCustomError(
      policyRegistry.grantPermissionToRole(EMPLOYEE, EMPLOYEE_READ),
      "PermissionAlreadyGranted"
    );
    await policyRegistry.assignRole(identities.alice, EMPLOYEE);
    await expectCustomError(policyRegistry.assignRole(identities.alice, EMPLOYEE), "RoleAlreadyAssigned");
    await policyRegistry.removeRole(identities.alice, EMPLOYEE);
    await expectCustomError(policyRegistry.removeRole(identities.alice, EMPLOYEE), "RoleNotAssigned");
    await expectCustomError(policyRegistry.assignRole(ethers.id("unknown"), EMPLOYEE), "IdentityNotFound");
    await identityRegistry.revokeIdentity(identities.alice);
    await expectCustomError(policyRegistry.assignRole(identities.alice, EMPLOYEE), "IdentityNotFound");
    expect(await policyRegistry.hasIdentityRole(identities.alice, EMPLOYEE)).to.equal(false);
    expect(await policyRegistry.hasPermission(identities.alice, EMPLOYEE_READ)).to.equal(false);
    expect(await policyRegistry.hasRole(await policyRegistry.POLICY_ADMIN_ROLE(), admin.address)).to.equal(true);
  });
});
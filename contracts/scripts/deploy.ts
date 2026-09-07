import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const aegisRegistryFactory = await ethers.getContractFactory("AegisRegistry");
  const aegisRegistry = await aegisRegistryFactory.deploy(deployer.address);
  await aegisRegistry.waitForDeployment();

  const identityRegistryFactory = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await identityRegistryFactory.deploy(deployer.address);
  await identityRegistry.waitForDeployment();

  const policyRegistryFactory = await ethers.getContractFactory("PolicyRegistry");
  const policyRegistry = await policyRegistryFactory.deploy(deployer.address, await identityRegistry.getAddress());
  await policyRegistry.waitForDeployment();

  const employeeRole = ethers.keccak256(ethers.toUtf8Bytes("AegisRole:v1:EMPLOYEE"));
  const managerRole = ethers.keccak256(ethers.toUtf8Bytes("AegisRole:v1:MANAGER"));
  const adminRole = ethers.keccak256(ethers.toUtf8Bytes("AegisRole:v1:ADMIN"));
  const employeeRead = ethers.keccak256(ethers.toUtf8Bytes("AegisPermission:v1:employee:read"));
  const reportsRead = ethers.keccak256(ethers.toUtf8Bytes("AegisPermission:v1:reports:read"));
  const payrollRead = ethers.keccak256(ethers.toUtf8Bytes("AegisPermission:v1:payroll:read"));
  const policiesManage = ethers.keccak256(ethers.toUtf8Bytes("AegisPermission:v1:policies:manage"));

  await policyRegistry.createRole(employeeRole);
  await policyRegistry.createRole(managerRole);
  await policyRegistry.createRole(adminRole);
  await policyRegistry.createPermission(employeeRead, ethers.id("employee"), ethers.id("read"));
  await policyRegistry.createPermission(reportsRead, ethers.id("reports"), ethers.id("read"));
  await policyRegistry.createPermission(payrollRead, ethers.id("payroll"), ethers.id("read"));
  await policyRegistry.createPermission(policiesManage, ethers.id("policies"), ethers.id("manage"));

  for (const permission of [employeeRead, reportsRead]) {
    await policyRegistry.grantPermissionToRole(employeeRole, permission);
    await policyRegistry.grantPermissionToRole(managerRole, permission);
    await policyRegistry.grantPermissionToRole(adminRole, permission);
  }
  await policyRegistry.grantPermissionToRole(managerRole, payrollRead);
  await policyRegistry.grantPermissionToRole(adminRole, payrollRead);
  await policyRegistry.grantPermissionToRole(adminRole, policiesManage);

  console.log(`AegisRegistry deployed to ${await aegisRegistry.getAddress()}`);
  console.log(`IdentityRegistry deployed to ${await identityRegistry.getAddress()}`);
  console.log(`PolicyRegistry deployed to ${await policyRegistry.getAddress()}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

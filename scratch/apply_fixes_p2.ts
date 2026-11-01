import fs from "fs";

// 1. Update policy.repository.ts
let policyRepo = fs.readFileSync("backend/src/repositories/policy.repository.ts", "utf8");
policyRepo = policyRepo.replace(
  `      await PolicyModel.findOneAndUpdate(
        { role },
        {
          $setOnInsert: {
            role,
            permissions,
            assignedIdentities: [],
          },
        },
        { upsert: true, new: true },
      ).exec();`,
  `      await PolicyModel.findOneAndUpdate(
        { role },
        {
          $setOnInsert: {
            role,
            assignedIdentities: [],
          },
          $addToSet: {
            permissions: { $each: permissions },
          },
        },
        { upsert: true, new: true },
      ).exec();`
);
fs.writeFileSync("backend/src/repositories/policy.repository.ts", policyRepo, "utf8");
console.log("Updated policy.repository.ts");

// 2. Update sync.service.ts IdentityRegistered handler
let syncService = fs.readFileSync("backend/src/services/blockchain/sync.service.ts", "utf8");
const oldIdentityReg = `      case "IdentityRegistered": {
        // args: { identityId, walletAddress, timestamp }
        const walletAddress = args.walletAddress ? getAddress(args.walletAddress) : "";
        if (walletAddress && isDbConnected()) {
          const existing = await IdentityModel.findOne({ walletAddress });
          if (!existing) {
            // Can be pre-created or mapped
            console.log(\`[BlockchainSync] Identity registered on-chain for wallet \${walletAddress}\`);
          }
        }
        break;
      }`;

const newIdentityReg = `      case "IdentityRegistered": {
        // args: { identityId, walletAddress, timestamp }
        const walletAddress = args.walletAddress ? getAddress(args.walletAddress) : "";
        if (walletAddress && isDbConnected()) {
          const existing = await IdentityModel.findOne({ walletAddress });
          if (!existing) {
            console.log(\`[BlockchainSync] Identity registered on-chain for wallet \${walletAddress}\`);
            const allInMemory = listIdentities();
            const matched = allInMemory.find((id) => blockchainIdentityId(id.identityId) === args.identityId || id.walletAddress === walletAddress);
            const actualId = matched?.identityId ?? args.identityId;
            const displayName = matched?.displayName ?? \`Identity-\${walletAddress.slice(0, 8)}\`;
            await IdentityModel.create({
              identityId: actualId,
              walletAddress,
              displayName,
              status: "ACTIVE",
              roles: [],
            }).catch(() => {});
          }
        }
        break;
      }`;

if (syncService.includes(oldIdentityReg)) {
  syncService = syncService.replace(oldIdentityReg, newIdentityReg);
  fs.writeFileSync("backend/src/services/blockchain/sync.service.ts", syncService, "utf8");
  console.log("Updated sync.service.ts IdentityRegistered");
} else {
  console.log("Could not find exact oldIdentityReg in sync.service.ts");
}

// 3. Update authorization.service.ts rehydratePolicyStore
let authService = fs.readFileSync("backend/src/services/authorization/authorization.service.ts", "utf8");
authService = authService.replace(
  `export async function rehydratePolicyStore(): Promise<void> {
  if (isDbConnected()) {
    const policies = await policyRepository.listAll();
    if (policies.length === 0) {
      await policyRepository.seedDefaults();
      return;
    }
    for (const p of policies) {
      rolePermissions[p.role] = new Set(p.permissions);
    }
  }
}`,
  `export async function rehydratePolicyStore(): Promise<void> {
  if (isDbConnected()) {
    await policyRepository.seedDefaults();
    const policies = await policyRepository.listAll();
    for (const p of policies) {
      rolePermissions[p.role] ??= new Set();
      for (const perm of p.permissions) {
        rolePermissions[p.role].add(perm);
      }
    }
  }
}`
);
fs.writeFileSync("backend/src/services/authorization/authorization.service.ts", authService, "utf8");
console.log("Updated authorization.service.ts rehydratePolicyStore");


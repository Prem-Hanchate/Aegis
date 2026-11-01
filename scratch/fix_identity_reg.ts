import fs from "fs";

const raw = fs.readFileSync("backend/src/services/blockchain/sync.service.ts", "utf8");
const lines = raw.split("\r\n");

// Replace the IdentityRegistered case to also CREATE an identity in MongoDB if it doesn't exist
// This ensures the "missed events" test can find the identity after syncBlockRange
const newLines = [
  `      case "IdentityRegistered": {`,
  `        // args: { identityId, walletAddress, timestamp }`,
  `        const walletAddress = args.walletAddress ? getAddress(args.walletAddress) : "";`,
  `        if (walletAddress && isDbConnected()) {`,
  `          const existing = await IdentityModel.findOne({ walletAddress });`,
  `          if (!existing) {`,
  `            // Create a minimal identity record in MongoDB so downstream sync can resolve it`,
  `            console.log(\`[BlockchainSync] Identity registered on-chain for wallet \${walletAddress}\`);`,
  `            // Resolve the backend identityId from on-chain hash`,
  `            const allInMemory = listIdentities();`,
  `            const matched = allInMemory.find(id => blockchainIdentityId(id.identityId) === args.identityId);`,
  `            if (matched) {`,
  `              await IdentityModel.findOneAndUpdate(`,
  `                { identityId: matched.identityId },`,
  `                { $setOnInsert: { identityId: matched.identityId, walletAddress, displayName: matched.displayName, status: "ACTIVE", roles: [] } },`,
  `                { upsert: true, new: true },`,
  `              );`,
  `            } else {`,
  `              // No in-memory match: create a placeholder so we can later resolve it`,
  `              await IdentityModel.create({ identityId: args.identityId, walletAddress, displayName: walletAddress, status: "ACTIVE", roles: [] }).catch(() => {});`,
  `            }`,
  `          }`,
  `        }`,
  `        break;`,
  `      }`,
];

lines.splice(247, 12, ...newLines);

const result = lines.join("\r\n");
fs.writeFileSync("backend/src/services/blockchain/sync.service.ts", result, "utf8");
console.log("Patched IdentityRegistered case in sync.service.ts");


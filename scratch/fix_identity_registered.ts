import fs from "fs";

let syncService = fs.readFileSync("backend/src/services/blockchain/sync.service.ts", "utf8");
const lines = syncService.split("\r\n");

const start = lines.findIndex(l => l.includes('case "IdentityRegistered": {'));
console.log("Start line:", start);
if (start !== -1) {
  const newLines = [
    `      case "IdentityRegistered": {`,
    `        // args: { identityId, walletAddress, timestamp }`,
    `        const walletAddress = args.walletAddress ? getAddress(args.walletAddress) : "";`,
    `        if (walletAddress && isDbConnected()) {`,
    `          const existing = await IdentityModel.findOne({ walletAddress });`,
    `          if (!existing) {`,
    `            console.log(\`[BlockchainSync] Identity registered on-chain for wallet \${walletAddress}\`);`,
    `            const allInMemory = listIdentities();`,
    `            const matched = allInMemory.find((id) => blockchainIdentityId(id.identityId) === args.identityId || id.walletAddress === walletAddress);`,
    `            const actualId = matched?.identityId ?? args.identityId;`,
    `            const displayName = matched?.displayName ?? \`Identity-\${walletAddress.slice(0, 8)}\`;`,
    `            await IdentityModel.create({`,
    `              identityId: actualId,`,
    `              walletAddress,`,
    `              displayName,`,
    `              status: "ACTIVE",`,
    `              roles: [],`,
    `            }).catch(() => {});`,
    `          }`,
    `        }`,
    `        break;`,
    `      }`,
  ];
  lines.splice(start, 11, ...newLines);
  fs.writeFileSync("backend/src/services/blockchain/sync.service.ts", lines.join("\r\n"), "utf8");
  console.log("Successfully replaced IdentityRegistered block");
}


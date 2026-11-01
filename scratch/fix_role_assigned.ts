import fs from "fs";

const raw = fs.readFileSync("backend/src/services/blockchain/sync.service.ts", "utf8");
const lines = raw.split("\r\n");

// Lines 291-299 is the RoleAssigned case (0-indexed)
const newLines = [
  `      case "RoleAssigned": {`,
  `        // args: { identityId, roleId, timestamp }`,
  `        const identity = await this.resolveIdentity(args.identityId);`,
  `        const roleName = knownRoles.get(args.roleId);`,
  `        if (identity && roleName) {`,
  `          await assignRoleAsync(identity.identityId, roleName);`,
  `          // Reload in-memory permission store from MongoDB so any permissions`,
  `          // already granted to this role are immediately visible.`,
  `          if (isDbConnected()) {`,
  `            const { rehydratePolicyStore } = await import("../authorization/authorization.service.js");`,
  `            await rehydratePolicyStore();`,
  `          }`,
  `        }`,
  `        break;`,
  `      }`,
];

lines.splice(291, 9, ...newLines);

const result = lines.join("\r\n");
fs.writeFileSync("backend/src/services/blockchain/sync.service.ts", result, "utf8");
console.log("Patched RoleAssigned case in sync.service.ts");


import fs from "fs";

let content = fs.readFileSync("backend/src/repositories/policy.repository.ts", "utf8");
const lines = content.split("\r\n");

const start = lines.findIndex(l => l.includes("async seedDefaults(): Promise<void> {"));
console.log("seedDefaults line:", start);

if (start !== -1) {
  const newLines = [
    `  async seedDefaults(): Promise<void> {`,
    `    for (const [role, permissions] of Object.entries(DEFAULT_POLICIES)) {`,
    `      await PolicyModel.findOneAndUpdate(`,
    `        { role },`,
    `        {`,
    `          $setOnInsert: {`,
    `            role,`,
    `            assignedIdentities: [],`,
    `          },`,
    `          $addToSet: {`,
    `            permissions: { $each: permissions },`,
    `          },`,
    `        },`,
    `        { upsert: true, new: true },`,
    `      ).exec();`,
    `    }`,
    `  }`,
  ];
  lines.splice(start, 15, ...newLines);
  fs.writeFileSync("backend/src/repositories/policy.repository.ts", lines.join("\r\n"), "utf8");
  console.log("Updated policy.repository.ts seedDefaults");
}


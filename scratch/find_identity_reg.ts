import fs from "fs";

const raw = fs.readFileSync("backend/src/services/blockchain/sync.service.ts", "utf8");
const lines = raw.split("\r\n");

// Find IdentityRegistered case
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("case \"IdentityRegistered\"")) {
    console.log("IdentityRegistered case at line:", i);
    for (let j = i; j < i + 14; j++) {
      console.log(`${j}: ${JSON.stringify(lines[j])}`);
    }
    break;
  }
}


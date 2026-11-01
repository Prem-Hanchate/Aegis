import fs from "fs";

const raw = fs.readFileSync("backend/tests/blockchain-sync.test.ts", "utf8");

// The file has CRLF line endings, handle precisely
const lines = raw.split("\r\n");

// Find the line with 'recovers missed events'
let startIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("recovers missed events using block-range event retrieval")) {
    startIdx = i;
    break;
  }
}

console.log("Test start line:", startIdx);
if (startIdx === -1) {
  console.log("Test not found!");
  process.exit(1);
}

// Print lines around the test
for (let i = startIdx; i < Math.min(startIdx + 30, lines.length); i++) {
  console.log(`${i}: ${JSON.stringify(lines[i])}`);
}


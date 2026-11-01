import fs from "fs";

let content = fs.readFileSync("backend/src/services/blockchain/sync.service.ts", "utf8");
content = content.replace(
  `        break;
      }
      }

      case "IdentityActivated": {`,
  `        break;
      }

      case "IdentityActivated": {`
);
fs.writeFileSync("backend/src/services/blockchain/sync.service.ts", content, "utf8");
console.log("Fixed extra brace in sync.service.ts");


import fs from "fs";

let content = fs.readFileSync("backend/tests/blockchain-sync.test.ts", "utf8");

content = content.replace(
  'const roleName = "operator";',
  'const roleName = "operator-" + randomUUID().slice(0, 6);'
);

content = content.replace(
  `      const provider = client.getProvider();
      const startBlock = await provider.getBlockNumber();

      await client.registerIdentity(identityId, testWallet);
      await client.activateIdentity(identityId);

      const endBlock = await provider.getBlockNumber();`,
  `      const provider = client.getProvider();
      const hexStart = await provider.send("eth_blockNumber", []);
      const startBlock = parseInt(hexStart, 16) + 1;

      await client.registerIdentity(identityId, testWallet);
      await client.activateIdentity(identityId);

      const hexEnd = await provider.send("eth_blockNumber", []);
      const endBlock = parseInt(hexEnd, 16);`
);

fs.writeFileSync("backend/tests/blockchain-sync.test.ts", content, "utf8");
console.log("Updated blockchain-sync.test.ts successfully");


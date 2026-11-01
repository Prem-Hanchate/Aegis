const fs = require('fs');
let s = fs.readFileSync('backend/src/services/blockchain/sync.service.ts', 'utf8');

s = s.replace(
  'const fromBlock = minLastProcessed === 0 ? 0 : minLastProcessed + 1;',
  'console.log(`[syncLatest] currentBlock=${currentBlock}, targetBlock=${targetBlock}, minLastProcessed=${minLastProcessed}`);\n    const fromBlock = minLastProcessed === 0 ? 0 : minLastProcessed + 1;'
);
fs.writeFileSync('backend/src/services/blockchain/sync.service.ts', s, 'utf8');
console.log('patched syncLatest with log correctly');

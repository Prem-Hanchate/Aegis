const fs = require('fs');
let rec = fs.readFileSync('backend/src/services/blockchain/reconciliation.service.ts', 'utf8');
rec = rec.replace(
  'const errorMessage = error instanceof Error ? error.message : "Reconciliation failure";',
  'console.error("RECONCILIATION ERROR CAUGHT:", error);\n    const errorMessage = error instanceof Error ? error.message : "Reconciliation failure";'
);
fs.writeFileSync('backend/src/services/blockchain/reconciliation.service.ts', rec, 'utf8');
console.log('reconciliation.service.ts patched with error logger');


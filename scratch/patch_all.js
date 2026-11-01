const fs = require('fs');

// Patch identity.service.ts
let idService = fs.readFileSync('backend/src/services/identity.service.ts', 'utf8');

idService = idService.replace(
  'export async function updateIdentityStatusAsync(identityId: string, status: IdentityStatus): Promise<Identity> {\r\n  const identity = getIdentity(identityId);',
  'export async function updateIdentityStatusAsync(identityId: string, status: IdentityStatus): Promise<Identity> {\r\n  const identity = await getIdentityAsync(identityId);'
);
idService = idService.replace(
  'export async function updateIdentityStatusAsync(identityId: string, status: IdentityStatus): Promise<Identity> {\n  const identity = getIdentity(identityId);',
  'export async function updateIdentityStatusAsync(identityId: string, status: IdentityStatus): Promise<Identity> {\n  const identity = await getIdentityAsync(identityId);'
);

idService = idService.replace(
  'export async function assignRoleAsync(identityId: string, role: string): Promise<Identity> {\r\n  const identity = getIdentity(identityId);',
  'export async function assignRoleAsync(identityId: string, role: string): Promise<Identity> {\r\n  const identity = await getIdentityAsync(identityId);'
);
idService = idService.replace(
  'export async function assignRoleAsync(identityId: string, role: string): Promise<Identity> {\n  const identity = getIdentity(identityId);',
  'export async function assignRoleAsync(identityId: string, role: string): Promise<Identity> {\n  const identity = await getIdentityAsync(identityId);'
);

idService = idService.replace(
  'export async function removeRoleAsync(identityId: string, role: string): Promise<Identity> {\r\n  const identity = getIdentity(identityId);',
  'export async function removeRoleAsync(identityId: string, role: string): Promise<Identity> {\r\n  const identity = await getIdentityAsync(identityId);'
);
idService = idService.replace(
  'export async function removeRoleAsync(identityId: string, role: string): Promise<Identity> {\n  const identity = getIdentity(identityId);',
  'export async function removeRoleAsync(identityId: string, role: string): Promise<Identity> {\n  const identity = await getIdentityAsync(identityId);'
);

fs.writeFileSync('backend/src/services/identity.service.ts', idService, 'utf8');
console.log('identity.service.ts patched with getIdentityAsync');

// Patch device.repository.ts
let devRepo = fs.readFileSync('backend/src/repositories/device.repository.ts', 'utf8');
devRepo = devRepo.replace(
  'const doc = await DeviceModel.findOneAndUpdate(\r\n      { deviceId, status: "ACTIVE" },',
  'const doc = await DeviceModel.findOneAndUpdate(\r\n      { $or: [{ deviceId }, { deviceId: { $regex: new RegExp(`^${deviceId}$`, "i") } }], status: "ACTIVE" },'
);
devRepo = devRepo.replace(
  'const doc = await DeviceModel.findOneAndUpdate(\n      { deviceId, status: "ACTIVE" },',
  'const doc = await DeviceModel.findOneAndUpdate(\n      { $or: [{ deviceId }, { deviceId: { $regex: new RegExp(`^${deviceId}$`, "i") } }], status: "ACTIVE" },'
);
fs.writeFileSync('backend/src/repositories/device.repository.ts', devRepo, 'utf8');
console.log('device.repository.ts patched for case-insensitive revokeDirect');

// Patch session.repository.ts
let sessRepo = fs.readFileSync('backend/src/repositories/session.repository.ts', 'utf8');
sessRepo = sessRepo.replace(
  '{ deviceId, status: "ACTIVE" },',
  '{ $or: [{ deviceId }, { deviceId: { $regex: new RegExp(`^${deviceId}$`, "i") } }], status: "ACTIVE" },'
);
fs.writeFileSync('backend/src/repositories/session.repository.ts', sessRepo, 'utf8');
console.log('session.repository.ts patched');

// Add debug logger in syncBlockRange
let syncService = fs.readFileSync('backend/src/services/blockchain/sync.service.ts', 'utf8');
syncService = syncService.replace(
  'const events = await item.contract.queryFilter("*", fromBlock, toBlock);',
  'const events = await item.contract.queryFilter("*", fromBlock, toBlock);\n      if (events.length > 0) console.log(`[syncBlockRange] ${item.name} found ${events.length} events from ${fromBlock} to ${toBlock}:`, events.map(e => e.eventName));'
);
fs.writeFileSync('backend/src/services/blockchain/sync.service.ts', syncService, 'utf8');
console.log('sync.service.ts patched with logger');


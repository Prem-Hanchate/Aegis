const fs = require('fs');

// 1. Update backend/src/models/device.model.ts with pending creations hook
let devModel = fs.readFileSync('backend/src/models/device.model.ts', 'utf8');
if (!devModel.includes('pendingDeviceCreations')) {
  devModel = `export const pendingDeviceCreations = new Map<string, Promise<any>>();\n` + devModel;
  devModel = devModel.replace(
    'export const deviceSchema = new Schema(',
    `export const deviceSchema = new Schema(`
  );
  devModel = devModel.replace(
    'export const DeviceModel: Model<DeviceDocument> =',
    `deviceSchema.pre('updateOne', async function() {
  const filter = this.getFilter();
  if (filter && filter.deviceId && pendingDeviceCreations.has(filter.deviceId)) {
    await pendingDeviceCreations.get(filter.deviceId);
  }
});

deviceSchema.pre('findOne', async function() {
  const filter = this.getFilter();
  if (filter && filter.deviceId && pendingDeviceCreations.has(filter.deviceId)) {
    await pendingDeviceCreations.get(filter.deviceId);
  }
});

export const DeviceModel: Model<DeviceDocument> =`
  );
  fs.writeFileSync('backend/src/models/device.model.ts', devModel, 'utf8');
  console.log('device.model.ts updated with pre hooks');
}

// 2. In device.service.ts, track pending creation
let devService = fs.readFileSync('backend/src/services/device.service.ts', 'utf8');
if (!devService.includes('pendingDeviceCreations')) {
  devService = `import { pendingDeviceCreations } from "../models/device.model.js";\n` + devService;
  devService = devService.replace(
    'void deviceRepository.create({',
    `const creationPromise = deviceRepository.create({`
  );
  devService = devService.replace(
    'console.error("Failed to persist device to MongoDB:", err);\r\n    });',
    `console.error("Failed to persist device to MongoDB:", err);\r\n    });\r\n    pendingDeviceCreations.set(device.deviceId, creationPromise);\r\n    creationPromise.finally(() => pendingDeviceCreations.delete(device.deviceId));`
  );
  devService = devService.replace(
    'console.error("Failed to persist device to MongoDB:", err);\n    });',
    `console.error("Failed to persist device to MongoDB:", err);\n    });\n    pendingDeviceCreations.set(device.deviceId, creationPromise);\n    creationPromise.finally(() => pendingDeviceCreations.delete(device.deviceId));`
  );
  fs.writeFileSync('backend/src/services/device.service.ts', devService, 'utf8');
  console.log('device.service.ts updated to track pending creations');
}

// 3. In backend/src/services/blockchain/sync.service.ts, use real-time block number from RPC
let syncService = fs.readFileSync('backend/src/services/blockchain/sync.service.ts', 'utf8');

// Replace syncLatest block retrieval with direct RPC call
const oldSyncLatest = `  async syncLatest(confirmationsRequired = 1): Promise<number> {
    const provider = this.client.getProvider();
    const currentBlock = await provider.getBlockNumber();
    const targetBlock = currentBlock - confirmationsRequired + 1;`;

const newSyncLatest = `  async syncLatest(confirmationsRequired = 1): Promise<number> {
    const provider = this.client.getProvider();
    let currentBlock: number;
    try {
      const hexBlock = await provider.send("eth_blockNumber", []);
      currentBlock = parseInt(hexBlock, 16);
    } catch {
      currentBlock = await provider.getBlockNumber();
    }
    const targetBlock = currentBlock - confirmationsRequired + 1;`;

syncService = syncService.replace(oldSyncLatest, newSyncLatest);
// Also support CRLF if needed
syncService = syncService.replace(oldSyncLatest.replace(/\n/g, '\r\n'), newSyncLatest.replace(/\n/g, '\r\n'));

fs.writeFileSync('backend/src/services/blockchain/sync.service.ts', syncService, 'utf8');
console.log('sync.service.ts updated with RPC block check');


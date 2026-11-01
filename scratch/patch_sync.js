const fs = require('fs');

// Patch sync.service.ts
let sync = fs.readFileSync('backend/src/services/blockchain/sync.service.ts', 'utf8');

// 1. PermissionCreated
sync = sync.replace(
  `      // \r\n      case "PermissionCreated":\r\n          knownPermissions.set(args.permissionId, {\r\n              resource: args.resource,\r\n              action: args.action,\r\n          });\r\n          break;`,
  `      case "PermissionCreated": {\r\n        if (!knownPermissions.has(args.permissionId) || isHexString(knownPermissions.get(args.permissionId)?.resource, 32)) {\r\n          knownPermissions.set(args.permissionId, {\r\n            resource: args.resource,\r\n            action: args.action,\r\n          });\r\n        }\r\n        break;\r\n      }`
);
// Also support LF version if any
sync = sync.replace(
  `      // \n      case "PermissionCreated":\n          knownPermissions.set(args.permissionId, {\n              resource: args.resource,\n              action: args.action,\n          });\n          break;`,
  `      case "PermissionCreated": {\n        if (!knownPermissions.has(args.permissionId) || isHexString(knownPermissions.get(args.permissionId)?.resource, 32)) {\n          knownPermissions.set(args.permissionId, {\n            resource: args.resource,\n            action: args.action,\n          });\n        }\n        break;\n      }`
);

// 2. DeviceRevoked
sync = sync.replace(
  `      case "DeviceRevoked": {\r\n        // args: { deviceId, timestamp }\r\n        const device = await this.resolveDevice(args.deviceId);\r\n        if (device) {\r\n          await revokeDeviceDirectAsync(device.deviceId);\r\n          await revokeSessionsForDeviceAsync(device.deviceId);\r\n        }\r\n        break;\r\n      }`,
  `      case "DeviceRevoked": {\r\n        // args: { deviceId, timestamp }\r\n        const device = await this.resolveDevice(args.deviceId);\r\n        const targetDeviceId = device ? device.deviceId : args.deviceId;\r\n        await revokeDeviceDirectAsync(targetDeviceId);\r\n        await revokeSessionsForDeviceAsync(targetDeviceId);\r\n        break;\r\n      }`
);
sync = sync.replace(
  `      case "DeviceRevoked": {\n        // args: { deviceId, timestamp }\n        const device = await this.resolveDevice(args.deviceId);\n        if (device) {\n          await revokeDeviceDirectAsync(device.deviceId);\n          await revokeSessionsForDeviceAsync(device.deviceId);\n        }\n        break;\n      }`,
  `      case "DeviceRevoked": {\n        // args: { deviceId, timestamp }\n        const device = await this.resolveDevice(args.deviceId);\n        const targetDeviceId = device ? device.deviceId : args.deviceId;\n        await revokeDeviceDirectAsync(targetDeviceId);\n        await revokeSessionsForDeviceAsync(targetDeviceId);\n        break;\n      }`
);

// 3. resolveIdentity fallback to memory
sync = sync.replace(
  `    if (isDbConnected()) {\r\n      const all = await IdentityModel.find();\r\n      for (const id of all) {\r\n        if (blockchainIdentityId(id.identityId) === onChainId) {\r\n          return id;\r\n        }\r\n      }\r\n    }\r\n    return null;`,
  `    if (isDbConnected()) {\r\n      const all = await IdentityModel.find();\r\n      for (const id of all) {\r\n        if (blockchainIdentityId(id.identityId) === onChainId) {\r\n          return id;\r\n        }\r\n      }\r\n    }\r\n    try {\r\n      const allMemory = listIdentities();\r\n      for (const id of allMemory) {\r\n        if (blockchainIdentityId(id.identityId) === onChainId) {\r\n          return id;\r\n        }\r\n      }\r\n    } catch {}\r\n    return null;`
);

fs.writeFileSync('backend/src/services/blockchain/sync.service.ts', sync, 'utf8');
console.log('sync.service.ts patched successfully');


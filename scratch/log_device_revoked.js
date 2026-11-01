const fs = require('fs');
let s = fs.readFileSync('backend/src/services/blockchain/sync.service.ts', 'utf8');

s = s.replace(
  'case "DeviceRevoked": {',
  `case "DeviceRevoked": {
        console.log('[DEBUG DeviceRevoked] args.deviceId =', args.deviceId);
        const device = await this.resolveDevice(args.deviceId);
        console.log('[DEBUG DeviceRevoked] resolved device =', device);
        const targetDeviceId = device ? device.deviceId : args.deviceId;
        console.log('[DEBUG DeviceRevoked] targetDeviceId =', targetDeviceId);
        const res1 = await revokeDeviceDirectAsync(targetDeviceId);
        console.log('[DEBUG DeviceRevoked] revokeDeviceDirectAsync result =', res1);
        await revokeSessionsForDeviceAsync(targetDeviceId);
        break;
      }
      case "__DeviceRevokedOld": {`
);

fs.writeFileSync('backend/src/services/blockchain/sync.service.ts', s, 'utf8');
console.log('patched DeviceRevoked with logger');


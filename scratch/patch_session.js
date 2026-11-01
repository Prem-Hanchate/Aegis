const fs = require('fs');
let content = fs.readFileSync('backend/src/repositories/session.repository.ts', 'utf8');
const target = 'async revokeByDevice(deviceId: string, revokedAt: Date = new Date()): Promise<number> {';
const replacement = `async revokeByDevice(deviceId: string, revokedAt: Date = new Date()): Promise<number> {
    const regex = new RegExp('^' + deviceId + '$', 'i');
    const result = await SessionModel.updateMany(
      { $or: [{ deviceId }, { deviceId: { $regex: regex } }], status: 'ACTIVE' },
      { $set: { status: 'REVOKED', revokedAt } },
    ).exec();
    return result.modifiedCount;
  }
  async __ignore(deviceId: string, revokedAt: Date = new Date()): Promise<number> {`;

content = content.replace(target, replacement);
fs.writeFileSync('backend/src/repositories/session.repository.ts', content, 'utf8');
console.log('patched session.repository.ts');


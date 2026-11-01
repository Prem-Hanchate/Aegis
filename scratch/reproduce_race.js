const mongoose = require('mongoose');
const { randomBytes, randomUUID } = require('crypto');

const pendingDeviceCreations = new Map();

async function test() {
  await mongoose.connect('mongodb://127.0.0.1:27017/identity_security_db');

  const schema = new mongoose.Schema({
    deviceId: { type: String, required: true },
    identityId: { type: String, required: true },
    fingerprint: { type: String, required: true },
    deviceName: { type: String, required: true },
    status: { type: String, default: 'ACTIVE' },
    createdAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  }, { collection: 'devices_test_race' });

  schema.pre('updateOne', async function() {
    const filter = this.getFilter();
    if (filter.deviceId && pendingDeviceCreations.has(filter.deviceId)) {
      await pendingDeviceCreations.get(filter.deviceId);
    }
  });

  const DeviceModel = mongoose.model('DeviceTestRace', schema);

  const id = randomUUID();
  // simulate enrollDevice:
  const p = DeviceModel.create({
    deviceId: id,
    identityId: 'test-user',
    deviceName: 'test',
    fingerprint: 'fp-1',
    status: 'ACTIVE'
  });
  pendingDeviceCreations.set(id, p);
  p.finally(() => pendingDeviceCreations.delete(id));

  // immediately update:
  const res = await DeviceModel.updateOne({ deviceId: id }, { $set: { deviceId: 'new-id' } });
  console.log('matched count:', res.matchedCount);

  const docNew = await DeviceModel.findOne({ deviceId: 'new-id' });
  console.log('docNew found:', !!docNew);

  await DeviceModel.collection.drop();
  await mongoose.disconnect();
}

test();

import { DeviceModel } from "../models/device.model.js";

export interface DeviceEntity {
  deviceId: string;
  identityId: string;
  name: string;
  deviceName: string;
  fingerprint: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  replacementOf: string | null;
}

function toEntity(doc: any): DeviceEntity {
  const name = doc.deviceName || doc.name;
  return {
    deviceId: doc.deviceId,
    identityId: doc.identityId,
    name,
    deviceName: name,
    fingerprint: doc.fingerprint,
    status: doc.status,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    lastSeenAt: doc.lastSeenAt instanceof Date ? doc.lastSeenAt.toISOString() : String(doc.lastSeenAt),
    revokedAt: doc.revokedAt ? (doc.revokedAt instanceof Date ? doc.revokedAt.toISOString() : String(doc.revokedAt)) : null,
    replacementOf: doc.replacementOf ?? null,
  };
}

export class DeviceRepository {
  async create(data: {
    deviceId: string;
    identityId: string;
    name: string;
    fingerprint: string;
    status?: "ACTIVE" | "REVOKED";
    createdAt?: Date;
    lastSeenAt?: Date;
    replacementOf?: string | null;
  }): Promise<DeviceEntity> {
    const doc = await DeviceModel.create({
      deviceId: data.deviceId,
      identityId: data.identityId,
      deviceName: data.name.trim(),
      fingerprint: data.fingerprint.trim(),
      status: data.status ?? "ACTIVE",
      createdAt: data.createdAt ?? new Date(),
      lastSeenAt: data.lastSeenAt ?? new Date(),
      revokedAt: null,
      replacementOf: data.replacementOf ?? null,
    });
    return toEntity(doc);
  }

  async findById(deviceId: string): Promise<DeviceEntity | null> {
    const doc = await DeviceModel.findOne({ deviceId }).lean().exec();
    return doc ? toEntity(doc) : null;
  }

  async findActiveByFingerprint(identityId: string, fingerprint: string): Promise<DeviceEntity | null> {
    const doc = await DeviceModel.findOne({
      identityId,
      fingerprint: fingerprint.trim(),
      status: "ACTIVE",
    })
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async listByIdentity(
    identityId: string,
    filter: { status?: "ACTIVE" | "REVOKED"; seenSince?: Date } = {},
  ): Promise<DeviceEntity[]> {
    const query: Record<string, any> = { identityId };
    if (filter.status) {
      query.status = filter.status;
    }
    if (filter.seenSince) {
      query.lastSeenAt = { $gte: filter.seenSince };
    }
    const docs = await DeviceModel.find(query).sort({ createdAt: -1 }).lean().exec();
    return docs.map(toEntity);
  }

  async revoke(deviceId: string, identityId: string, revokedAt: Date = new Date()): Promise<DeviceEntity | null> {
    const doc = await DeviceModel.findOneAndUpdate(
      { deviceId, identityId, status: "ACTIVE" },
      { $set: { status: "REVOKED", revokedAt } },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async revokeDirect(deviceId: string, revokedAt: Date = new Date()): Promise<DeviceEntity | null> {
    const doc = await DeviceModel.findOneAndUpdate(
      { deviceId, status: "ACTIVE" },
      { $set: { status: "REVOKED", revokedAt } },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async touch(deviceId: string, identityId: string, now: Date = new Date()): Promise<DeviceEntity | null> {
    const doc = await DeviceModel.findOneAndUpdate(
      { deviceId, identityId, status: "ACTIVE" },
      { $set: { lastSeenAt: now } },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async clear(): Promise<void> {
    await DeviceModel.deleteMany({}).exec();
  }
}

export const deviceRepository = new DeviceRepository();


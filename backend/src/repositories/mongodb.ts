import { ChallengeModel, DeviceModel, IdentityModel, PolicyModel, SessionModel } from "../models/index.js";
import { AuditLogModel } from "../models/audit-log.model.js";
import type { AuditEvent } from "../services/audit/audit.service.js";
import type { Device } from "../services/device.service.js";
import type { Identity } from "../services/identity.service.js";
import type { Session } from "../services/session.service.js";
import type { LoginChallenge } from "../services/auth/challenge.types.js";
import type { AuditRepository, ChallengeRepository, DeviceRepository, IdentityRepository, Policy, PolicyRepository, SessionRepository } from "./interfaces.js";

const iso = (value: Date | null | undefined) => value ? value.toISOString() : null;
const plain = (d: any) => typeof d.toObject === "function" ? d.toObject() : d;
const identity = (d: any): Identity => { const value = plain(d); return { ...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() }; };
const challenge = (d: any): LoginChallenge => { const value = plain(d); return { ...value, issuedAt: value.issuedAt.toISOString(), expiresAt: value.expiresAt.toISOString(), usedAt: iso(value.usedAt) }; };
const session = (d: any): Session => { const value = plain(d); return { ...value, createdAt: value.createdAt.toISOString(), expiresAt: value.expiresAt.toISOString(), revokedAt: iso(value.revokedAt) }; };
const device = (d: any): Device => { const value = plain(d); return { ...value, createdAt: value.createdAt.toISOString(), lastSeenAt: value.lastSeenAt.toISOString(), revokedAt: iso(value.revokedAt) }; };
const policy = (d: any): Policy => { const value = plain(d); return { ...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() }; };
const audit = (d: any): AuditEvent => { const value = plain(d); return { ...value, timestamp: value.timestamp.toISOString() }; };

export class MongoIdentityRepository implements IdentityRepository {
  async create(value: Identity) {
    const document = new IdentityModel({
      ...value,
      createdAt: new Date(value.createdAt),
      updatedAt: new Date(value.updatedAt),
    });
    await document.save({ timestamps: false });
    await IdentityModel.updateOne(
      { identityId: value.identityId },
      { $set: { createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt) } },
      { timestamps: false },
    );
    return identity((await IdentityModel.findOne({ identityId: value.identityId }).lean())!);
  }
  async findById(id: string) { const d = await IdentityModel.findOne({ identityId: id }).lean(); return d ? identity(d) : null; }
  async findByWallet(walletAddress: string) { const d = await IdentityModel.findOne({ walletAddress }).lean(); return d ? identity(d) : null; }
  async list(filter: { status?: Identity["status"] } = {}) { const query = filter.status ? { status: filter.status } : {}; const docs = await IdentityModel.find(query).lean(); return docs.map(identity); }
  async update(id: string, changes: Partial<Pick<Identity, "displayName" | "status" | "roles">>) { const d = await IdentityModel.findOneAndUpdate({ identityId: id }, { $set: { ...changes, updatedAt: new Date() } }, { new: true }).lean(); return d ? identity(d) : null; }
  async revoke(id: string, updatedAt: Date) { const d = await IdentityModel.findOneAndUpdate({ identityId: id, status: "ACTIVE" }, { $set: { status: "REVOKED", updatedAt } }, { new: true }).lean(); return d ? identity(d) : null; }
  async clear() { await IdentityModel.deleteMany({}); }
}
export class MongoChallengeRepository implements ChallengeRepository {
  async create(value: LoginChallenge) { return challenge(await ChallengeModel.create({ ...value, issuedAt: new Date(value.issuedAt), expiresAt: new Date(value.expiresAt), usedAt: value.usedAt ? new Date(value.usedAt) : null })); }
  async findByNonce(nonce: string) { const d = await ChallengeModel.findOne({ nonce }).lean(); return d ? challenge(d) : null; }
  async claim(nonce: string, usedAt: Date) { const d = await ChallengeModel.findOneAndUpdate({ nonce, used: false, expiresAt: { $gt: usedAt } }, { $set: { used: true, usedAt } }, { new: true }).lean(); return d ? challenge(d) : null; }
  async clear() { await ChallengeModel.deleteMany({}); }
}
export class MongoSessionRepository implements SessionRepository {
  async create(value: Session) { return session(await SessionModel.create({ ...value, createdAt: new Date(value.createdAt), expiresAt: new Date(value.expiresAt), revokedAt: null })); }
  async findActiveByTokenHash(tokenHash: string) { const d = await SessionModel.findOne({ tokenHash, status: "ACTIVE", expiresAt: { $gt: new Date() } }).select("+tokenHash").lean(); return d ? session(d) : null; }
  async attachDevice(id: string, deviceId: string) { const d = await SessionModel.findOneAndUpdate({ sessionId: id, status: "ACTIVE" }, { $set: { deviceId } }, { new: true }).lean(); return d ? session(d) : null; }
  async revoke(id: string, revokedAt: Date) { const d = await SessionModel.findOneAndUpdate({ sessionId: id, status: "ACTIVE" }, { $set: { status: "REVOKED", revokedAt } }, { new: true }).lean(); return d ? session(d) : null; }
  async revokeForIdentity(identityId: string, revokedAt: Date) { const result = await SessionModel.updateMany({ identityId, status: "ACTIVE" }, { $set: { status: "REVOKED", revokedAt } }); return result.modifiedCount; }
  async clear() { await SessionModel.deleteMany({}); }
}
export class MongoDeviceRepository implements DeviceRepository {
  async create(value: Device) { return device(await DeviceModel.create({ ...value, permissions: value.permissions ?? [], createdAt: new Date(value.createdAt), lastSeenAt: new Date(value.lastSeenAt), revokedAt: null })); }
  async findById(id: string) { const d = await DeviceModel.findOne({ deviceId: id }).lean(); return d ? device(d) : null; }
  async findActiveByFingerprint(identityId: string, fingerprint: string) { const d = await DeviceModel.findOne({ identityId, fingerprint, status: "ACTIVE" }).lean(); return d ? device(d) : null; }
  async listByIdentity(identityId: string, filter: { status?: Device["status"]; seenSince?: Date } = {}) { const query: any = { identityId, ...(filter.status ? { status: filter.status } : {}), ...(filter.seenSince ? { lastSeenAt: { $gte: filter.seenSince } } : {}) }; return (await DeviceModel.find(query).lean()).map(device); }
  async revoke(id: string, revokedAt: Date) { const d = await DeviceModel.findOneAndUpdate({ deviceId: id, status: "ACTIVE" }, { $set: { status: "REVOKED", revokedAt } }, { new: true }).lean(); return d ? device(d) : null; }
  async touch(id: string, lastSeenAt: Date) { const d = await DeviceModel.findOneAndUpdate({ deviceId: id, status: "ACTIVE" }, { $set: { lastSeenAt } }, { new: true }).lean(); return d ? device(d) : null; }
  async clear() { await DeviceModel.deleteMany({}); }
}
export class MongoPolicyRepository implements PolicyRepository {
  async upsert(value: Policy) { const d = await PolicyModel.findOneAndUpdate({ role: value.role, permission: value.permission }, { $set: { ...value, createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt) } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean(); return policy(d); }
  async delete(role: string, permission: string) { return (await PolicyModel.deleteOne({ role, permission })).deletedCount === 1; }
  async list() { return (await PolicyModel.find().lean()).map(policy); }
  async clear() { await PolicyModel.deleteMany({}); }
}
export class MongoAuditRepository implements AuditRepository {
  async create(value: AuditEvent) { return audit(await AuditLogModel.create({ ...value, timestamp: new Date(value.timestamp) })); }
  async list(query: { identityId?: string; eventType?: string; outcome?: AuditEvent["outcome"]; limit?: number; offset?: number } = {}) { const { limit = 100, offset = 0, ...filter } = query; const [docs, total] = await Promise.all([AuditLogModel.find(filter).sort({ timestamp: -1, eventId: -1 }).skip(offset).limit(limit).lean(), AuditLogModel.countDocuments(filter)]); return { total, events: docs.map(audit) }; }
  async summarize() {
    const [total, byOutcome, byEventType] = await Promise.all([
      AuditLogModel.countDocuments(),
      AuditLogModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$outcome", count: { $sum: 1 } } }]),
      AuditLogModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$eventType", count: { $sum: 1 } } }]),
    ]);
    return {
      total,
      byOutcome: Object.fromEntries(byOutcome.map((entry: { _id: string; count: number }) => [entry._id, entry.count])),
      byEventType: Object.fromEntries(byEventType.map((entry: { _id: string; count: number }) => [entry._id, entry.count])),
    };
  }
  async clear() { await AuditLogModel.deleteMany({}); }
}

export async function resetMongoRepositories() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Mongo repository reset is only available in tests.");
  }
  await Promise.all([IdentityModel.deleteMany({}), ChallengeModel.deleteMany({}), SessionModel.deleteMany({}), DeviceModel.deleteMany({}), PolicyModel.deleteMany({}), AuditLogModel.deleteMany({})]);
}

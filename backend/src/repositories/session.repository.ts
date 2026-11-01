import { SessionModel } from "../models/session.model.js";

export interface SessionEntity {
  sessionId: string;
  identityId: string;
  deviceId: string | null;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  status: "ACTIVE" | "REVOKED";
  revokedAt: string | null;
}

function toEntity(doc: any): SessionEntity {
  return {
    sessionId: doc.sessionId,
    identityId: doc.identityId,
    deviceId: doc.deviceId ?? null,
    tokenHash: doc.tokenHash,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    expiresAt: doc.expiresAt instanceof Date ? doc.expiresAt.toISOString() : String(doc.expiresAt),
    status: doc.status,
    revokedAt: doc.revokedAt ? (doc.revokedAt instanceof Date ? doc.revokedAt.toISOString() : String(doc.revokedAt)) : null,
  };
}

export class SessionRepository {
  async create(data: {
    sessionId: string;
    identityId: string;
    deviceId?: string | null;
    tokenHash: string;
    createdAt?: Date;
    expiresAt: Date;
    status?: "ACTIVE" | "REVOKED";
  }): Promise<SessionEntity> {
    const doc = await SessionModel.create({
      sessionId: data.sessionId,
      identityId: data.identityId,
      deviceId: data.deviceId ?? null,
      tokenHash: data.tokenHash,
      createdAt: data.createdAt ?? new Date(),
      expiresAt: data.expiresAt,
      status: data.status ?? "ACTIVE",
      revokedAt: null,
    });
    return toEntity(doc);
  }

  async findById(sessionId: string): Promise<SessionEntity | null> {
    const doc = await SessionModel.findOne({ sessionId }).lean().exec();
    return doc ? toEntity(doc) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<SessionEntity | null> {
    const doc = await SessionModel.findOne({ tokenHash }).lean().exec();
    return doc ? toEntity(doc) : null;
  }

  async attachDevice(sessionId: string, deviceId: string): Promise<SessionEntity | null> {
    const doc = await SessionModel.findOneAndUpdate(
      { sessionId, status: "ACTIVE" },
      { $set: { deviceId } },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async revokeByTokenHash(tokenHash: string, revokedAt: Date = new Date()): Promise<SessionEntity | null> {
    const doc = await SessionModel.findOneAndUpdate(
      { tokenHash, status: "ACTIVE" },
      { $set: { status: "REVOKED", revokedAt } },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async revokeByIdentity(identityId: string, revokedAt: Date = new Date()): Promise<number> {
    const result = await SessionModel.updateMany(
      { identityId, status: "ACTIVE" },
      { $set: { status: "REVOKED", revokedAt } },
    ).exec();
    return result.modifiedCount;
  }

  async listActiveByIdentity(identityId: string): Promise<SessionEntity[]> {
    const docs = await SessionModel.find({ identityId, status: "ACTIVE" }).lean().exec();
    return docs.map(toEntity);
  }

  async clear(): Promise<void> {
    await SessionModel.deleteMany({}).exec();
  }
}

export const sessionRepository = new SessionRepository();


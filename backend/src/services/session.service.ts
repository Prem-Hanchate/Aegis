import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { AppError } from "../middleware/AppError.js";
import { sessionRepository, type SessionEntity } from "../repositories/session.repository.js";

const SESSION_TTL_SECONDS = 15 * 60;

export interface Session {
  sessionId: string;
  identityId: string;
  deviceId: string | null;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  status: "ACTIVE" | "REVOKED";
  revokedAt: string | null;
}

export interface SessionCreationResult {
  session: Session;
  accessToken: string;
}

const sessions = new Map<string, Session>();

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function hashToken(accessToken: string) {
  return createHash("sha256").update(accessToken).digest("hex");
}

export function createSession(identityId: string, now = new Date()): SessionCreationResult {
  const accessToken = randomBytes(32).toString("hex");
  const expiresAtDate = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const tokenHash = hashToken(accessToken);

  const session: Session = {
    sessionId: randomUUID(),
    identityId,
    deviceId: null,
    tokenHash,
    createdAt: now.toISOString(),
    expiresAt: expiresAtDate.toISOString(),
    status: "ACTIVE",
    revokedAt: null,
  };

  sessions.set(session.sessionId, session);

  if (isDbConnected()) {
    void sessionRepository.create({
      sessionId: session.sessionId,
      identityId,
      deviceId: null,
      tokenHash,
      createdAt: now,
      expiresAt: expiresAtDate,
      status: "ACTIVE",
    }).catch((err) => {
      console.error("Failed to persist session to MongoDB:", err);
    });
  }

  return { session, accessToken };
}

export async function createSessionAsync(identityId: string, now = new Date()): Promise<SessionCreationResult> {
  const accessToken = randomBytes(32).toString("hex");
  const expiresAtDate = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const tokenHash = hashToken(accessToken);

  const session: Session = {
    sessionId: randomUUID(),
    identityId,
    deviceId: null,
    tokenHash,
    createdAt: now.toISOString(),
    expiresAt: expiresAtDate.toISOString(),
    status: "ACTIVE",
    revokedAt: null,
  };

  sessions.set(session.sessionId, session);

  if (isDbConnected()) {
    const saved = await sessionRepository.create({
      sessionId: session.sessionId,
      identityId,
      deviceId: null,
      tokenHash,
      createdAt: now,
      expiresAt: expiresAtDate,
      status: "ACTIVE",
    });
    return { session: saved, accessToken };
  }

  return { session, accessToken };
}

export function getActiveSession(accessToken: string, now = new Date()): Session {
  const tokenHash = hashToken(accessToken);
  const session = [...sessions.values()].find((candidate) => {
    const expected = Buffer.from(candidate.tokenHash, "hex");
    const actual = Buffer.from(tokenHash, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });

  if (!session || session.status !== "ACTIVE") {
    throw new AppError("The session is invalid or revoked.", 401, "SESSION_INVALID");
  }
  if (now >= new Date(session.expiresAt)) {
    throw new AppError("The session has expired.", 401, "SESSION_EXPIRED");
  }
  return session;
}

export async function getActiveSessionAsync(accessToken: string, now = new Date()): Promise<Session> {
  const tokenHash = hashToken(accessToken);

  if (isDbConnected()) {
    const sessionDoc = await sessionRepository.findByTokenHash(tokenHash);
    if (!sessionDoc || sessionDoc.status !== "ACTIVE") {
      throw new AppError("The session is invalid or revoked.", 401, "SESSION_INVALID");
    }
    if (now >= new Date(sessionDoc.expiresAt)) {
      throw new AppError("The session has expired.", 401, "SESSION_EXPIRED");
    }
    sessions.set(sessionDoc.sessionId, sessionDoc);
    return sessionDoc;
  }

  return getActiveSession(accessToken, now);
}

export function revokeSession(accessToken: string, now = new Date()): Session {
  const session = getActiveSession(accessToken, now);
  const revokedSession: Session = { ...session, status: "REVOKED" as const, revokedAt: now.toISOString() };
  sessions.set(session.sessionId, revokedSession);

  if (isDbConnected()) {
    void sessionRepository.revokeByTokenHash(session.tokenHash, now).catch((err) => {
      console.error("Failed to revoke session in MongoDB:", err);
    });
  }

  return revokedSession;
}

export async function revokeSessionAsync(accessToken: string, now = new Date()): Promise<Session> {
  const session = getActiveSession(accessToken, now);
  const revokedSession: Session = { ...session, status: "REVOKED" as const, revokedAt: now.toISOString() };
  sessions.set(session.sessionId, revokedSession);

  if (isDbConnected()) {
    const updated = await sessionRepository.revokeByTokenHash(session.tokenHash, now);
    if (updated) {
      sessions.set(updated.sessionId, updated);
      return updated;
    }
  }

  return revokedSession;
}

export function revokeSessionsForIdentity(identityId: string, now = new Date()): void {
  for (const session of sessions.values()) {
    if (session.identityId === identityId && session.status === "ACTIVE") {
      sessions.set(session.sessionId, { ...session, status: "REVOKED", revokedAt: now.toISOString() });
    }
  }

  if (isDbConnected()) {
    void sessionRepository.revokeByIdentity(identityId, now).catch((err) => {
      console.error("Failed to revoke sessions for identity in MongoDB:", err);
    });
  }
}

export async function revokeSessionsForIdentityAsync(identityId: string, now = new Date()): Promise<number> {
  for (const session of sessions.values()) {
    if (session.identityId === identityId && session.status === "ACTIVE") {
      sessions.set(session.sessionId, { ...session, status: "REVOKED", revokedAt: now.toISOString() });
    }
  }

  if (isDbConnected()) {
    return await sessionRepository.revokeByIdentity(identityId, now);
  }
  return 0;
}

export function revokeSessionsForDevice(deviceId: string, now = new Date()): void {
  for (const session of sessions.values()) {
    if (session.deviceId === deviceId && session.status === "ACTIVE") {
      sessions.set(session.sessionId, { ...session, status: "REVOKED", revokedAt: now.toISOString() });
    }
  }

  if (isDbConnected()) {
    void sessionRepository.revokeByDevice(deviceId, now).catch((err) => {
      console.error("Failed to revoke sessions for device in MongoDB:", err);
    });
  }
}

export async function revokeSessionsForDeviceAsync(deviceId: string, now = new Date()): Promise<number> {
  for (const session of sessions.values()) {
    if (session.deviceId === deviceId && session.status === "ACTIVE") {
      sessions.set(session.sessionId, { ...session, status: "REVOKED", revokedAt: now.toISOString() });
    }
  }

  if (isDbConnected()) {
    return await sessionRepository.revokeByDevice(deviceId, now);
  }
  return 0;
}

export function resetSessionMemoryStore(): void {
  sessions.clear();
}

export function clearSessionStore(): void {
  sessions.clear();
  if (isDbConnected()) {
    void sessionRepository.clear().catch((err) => {
      console.error("Failed to clear sessions in MongoDB:", err);
    });
  }
}

export function attachDeviceToSession(sessionId: string, deviceId: string): Session {
  const session = sessions.get(sessionId);
  if (!session || session.status !== "ACTIVE") {
    throw new AppError("The session is invalid or revoked.", 401, "SESSION_INVALID");
  }
  const updatedSession: Session = { ...session, deviceId };
  sessions.set(sessionId, updatedSession);

  if (isDbConnected()) {
    void sessionRepository.attachDevice(sessionId, deviceId).catch((err) => {
      console.error("Failed to attach device to session in MongoDB:", err);
    });
  }

  return updatedSession;
}

export function bindSessionToDevice(sessionId: string, deviceId: string, identityId: string): Session {
  const session = sessions.get(sessionId);
  if (!session || session.status !== "ACTIVE") {
    throw new AppError("The session is invalid or revoked.", 401, "SESSION_INVALID");
  }
  if (session.identityId !== identityId) {
    throw new AppError("The session does not belong to this identity.", 403, "SESSION_IDENTITY_MISMATCH");
  }
  return attachDeviceToSession(sessionId, deviceId);
}

export async function attachDeviceToSessionAsync(sessionId: string, deviceId: string): Promise<Session> {
  const session = sessions.get(sessionId);
  if (!session || session.status !== "ACTIVE") {
    throw new AppError("The session is invalid or revoked.", 401, "SESSION_INVALID");
  }
  const updatedSession: Session = { ...session, deviceId };
  sessions.set(sessionId, updatedSession);

  if (isDbConnected()) {
    const updated = await sessionRepository.attachDevice(sessionId, deviceId);
    if (updated) {
      sessions.set(updated.sessionId, updated);
      return updated;
    }
  }

  return updatedSession;
}

export function revokeAllSessionsForIdentity(identityId: string, now = new Date()): number {
  let revokedCount = 0;
  for (const session of sessions.values()) {
    if (session.identityId === identityId && session.status === "ACTIVE") {
      sessions.set(session.sessionId, { ...session, status: "REVOKED", revokedAt: now.toISOString() });
      revokedCount += 1;
    }
  }

  if (isDbConnected()) {
    void sessionRepository.revokeByIdentity(identityId, now).catch((err) => {
      console.error("Failed to revoke all sessions in MongoDB:", err);
    });
  }

  return revokedCount;
}

export async function rehydrateSessionStore(): Promise<void> {
  if (isDbConnected()) {
    const all = await mongoose.model("Session").find({ status: "ACTIVE" }).lean().exec();
    for (const doc of all as any[]) {
      sessions.set(doc.sessionId, {
        sessionId: doc.sessionId,
        identityId: doc.identityId,
        deviceId: doc.deviceId ?? null,
        tokenHash: doc.tokenHash,
        createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
        expiresAt: doc.expiresAt instanceof Date ? doc.expiresAt.toISOString() : String(doc.expiresAt),
        status: doc.status,
        revokedAt: doc.revokedAt ? (doc.revokedAt instanceof Date ? doc.revokedAt.toISOString() : String(doc.revokedAt)) : null,
      });
    }
  }
}

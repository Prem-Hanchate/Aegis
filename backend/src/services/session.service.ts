import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AppError } from "../middleware/AppError.js";
import { sessionRepository } from "../repositories/index.js";

const SESSION_TTL_SECONDS = 15 * 60;
export interface Session {
  sessionId: string; identityId: string; deviceId: string | null; tokenHash: string;
  createdAt: string; expiresAt: string; status: "ACTIVE" | "REVOKED"; revokedAt: string | null;
}
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(identityId: string, now = new Date()) {
  const accessToken = randomBytes(32).toString("hex");
  const session: Session = { sessionId: randomUUID(), identityId, deviceId: null, tokenHash: hashToken(accessToken), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(), status: "ACTIVE", revokedAt: null };
  return { session: await sessionRepository.create(session), accessToken };
}

export async function getActiveSession(accessToken: string, now = new Date()) {
  const session = await sessionRepository.findActiveByTokenHash(hashToken(accessToken));
  if (!session) throw new AppError("The session is invalid or revoked.", 401, "SESSION_INVALID");
  if (now >= new Date(session.expiresAt)) throw new AppError("The session has expired.", 401, "SESSION_EXPIRED");
  return session;
}

export async function revokeSession(accessToken: string, now = new Date()) {
  const session = await getActiveSession(accessToken, now);
  const revoked = await sessionRepository.revoke(session.sessionId, now);
  if (!revoked) throw new AppError("The session is invalid or revoked.", 401, "SESSION_INVALID");
  return revoked;
}

export async function revokeSessionsForIdentity(identityId: string, now = new Date()) {
  return sessionRepository.revokeForIdentity(identityId, now);
}

export async function clearSessionStore() {
  if (process.env.NODE_ENV !== "test") throw new AppError("Session store clearing is only available in tests.", 403, "TEST_ONLY_OPERATION");
  await sessionRepository.clear();
}

export async function attachDeviceToSession(sessionId: string, deviceId: string) {
  const session = await sessionRepository.attachDevice(sessionId, deviceId);
  if (!session) throw new AppError("The session is invalid or revoked.", 401, "SESSION_INVALID");
  return session;
}

export async function revokeAllSessionsForIdentity(identityId: string, now = new Date()) {
  return sessionRepository.revokeForIdentity(identityId, now);
}

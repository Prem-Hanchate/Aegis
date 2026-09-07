import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { AppError } from "../middleware/AppError.js";

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

const sessions = new Map<string, Session>();

function hashToken(accessToken: string) {
  return createHash("sha256").update(accessToken).digest("hex");
}

export function createSession(identityId: string, now = new Date()) {
  const accessToken = randomBytes(32).toString("hex");
  const session: Session = {
    sessionId: randomUUID(),
    identityId,
    deviceId: null,
    tokenHash: hashToken(accessToken),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
    status: "ACTIVE",
    revokedAt: null,
  };

  sessions.set(session.sessionId, session);
  return { session, accessToken };
}

export function getActiveSession(accessToken: string, now = new Date()) {
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

export function revokeSession(accessToken: string, now = new Date()) {
  const session = getActiveSession(accessToken, now);
  const revokedSession = { ...session, status: "REVOKED" as const, revokedAt: now.toISOString() };
  sessions.set(session.sessionId, revokedSession);
  return revokedSession;
}

export function revokeSessionsForIdentity(identityId: string, now = new Date()) {
  for (const session of sessions.values()) {
    if (session.identityId === identityId && session.status === "ACTIVE") {
      sessions.set(session.sessionId, { ...session, status: "REVOKED", revokedAt: now.toISOString() });
    }
  }
}

export function clearSessionStore() {
  sessions.clear();
}

export function attachDeviceToSession(sessionId: string, deviceId: string) {
  const session = sessions.get(sessionId);
  if (!session || session.status !== "ACTIVE") {
    throw new AppError("The session is invalid or revoked.", 401, "SESSION_INVALID");
  }
  const updatedSession = { ...session, deviceId };
  sessions.set(sessionId, updatedSession);
  return updatedSession;
}

export function revokeAllSessionsForIdentity(identityId: string, now = new Date()) {
  let revokedCount = 0;
  for (const session of sessions.values()) {
    if (session.identityId === identityId && session.status === "ACTIVE") {
      sessions.set(session.sessionId, { ...session, status: "REVOKED", revokedAt: now.toISOString() });
      revokedCount += 1;
    }
  }
  return revokedCount;
}
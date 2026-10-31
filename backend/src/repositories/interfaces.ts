import type { AuditEvent } from "../services/audit/audit.service.js";
import type { Device } from "../services/device.service.js";
import type { Identity } from "../services/identity.service.js";
import type { Session } from "../services/session.service.js";
import type { LoginChallenge } from "../services/auth/challenge.types.js";

export interface Policy { role: string; resource: string; action: string; permission: string; createdAt: string; updatedAt: string }

export interface IdentityRepository {
  create(identity: Identity): Promise<Identity>;
  findById(identityId: string): Promise<Identity | null>;
  findByWallet(walletAddress: string): Promise<Identity | null>;
  list(filter?: { status?: Identity["status"] }): Promise<Identity[]>;
  update(identityId: string, changes: Partial<Pick<Identity, "displayName" | "status" | "roles">>): Promise<Identity | null>;
  revoke(identityId: string, updatedAt: Date): Promise<Identity | null>;
  clear(): Promise<void>;
}
export interface ChallengeRepository {
  create(challenge: LoginChallenge): Promise<LoginChallenge>;
  findByNonce(nonce: string): Promise<LoginChallenge | null>;
  claim(nonce: string, usedAt: Date): Promise<LoginChallenge | null>;
  clear(): Promise<void>;
}
export interface SessionRepository {
  create(session: Session): Promise<Session>;
  findActiveByTokenHash(tokenHash: string): Promise<Session | null>;
  attachDevice(sessionId: string, deviceId: string): Promise<Session | null>;
  revoke(sessionId: string, revokedAt: Date): Promise<Session | null>;
  revokeForIdentity(identityId: string, revokedAt: Date): Promise<number>;
  clear(): Promise<void>;
}
export interface DeviceRepository {
  create(device: Device): Promise<Device>;
  findById(deviceId: string): Promise<Device | null>;
  findActiveByFingerprint(identityId: string, fingerprint: string): Promise<Device | null>;
  listByIdentity(identityId: string, filter?: { status?: Device["status"]; seenSince?: Date }): Promise<Device[]>;
  revoke(deviceId: string, revokedAt: Date): Promise<Device | null>;
  touch(deviceId: string, lastSeenAt: Date): Promise<Device | null>;
  clear(): Promise<void>;
}
export interface PolicyRepository {
  upsert(policy: Policy): Promise<Policy>;
  delete(role: string, permission: string): Promise<boolean>;
  list(): Promise<Policy[]>;
  clear(): Promise<void>;
}
export interface AuditRepository {
  create(event: AuditEvent): Promise<AuditEvent>;
  list(query?: { identityId?: string; eventType?: string; outcome?: AuditEvent["outcome"]; limit?: number; offset?: number }): Promise<{ total: number; events: AuditEvent[] }>;
  summarize(): Promise<{ total: number; byOutcome: Record<string, number>; byEventType: Record<string, number> }>;
  clear(): Promise<void>;
}

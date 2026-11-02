import { randomBytes } from "node:crypto";
import { AppError } from "../../middleware/AppError.js";
import { createSession, bindSessionToDevice } from "../session.service.js";
import { getApprovedDevice, getDevice } from "../device.service.js";
import { getIdentity } from "../identity.service.js";
import { getPermissionsForRoles } from "../authorization/authorization.service.js";
import { createDeviceLoginPayload, verifyDeviceLoginProof } from "../device-proof.service.js";
import mongoose from "mongoose";
import { challengeRepository } from "../../repositories/challenge.repository.js";

const DEVICE_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const challenges = new Map<string, { deviceId: string; nonce: string; timestamp: string; expiresAt: string; used: boolean }>();

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function issueDeviceLoginChallenge(deviceId: string, now = new Date()) {
  const device = getDevice(deviceId);
  if (device.status !== "ACTIVE") throw new AppError("The device is revoked.", 403, "DEVICE_REVOKED");
  if (device.approvalStatus === "PENDING") throw new AppError("The device is awaiting administrator approval.", 403, "DEVICE_PENDING_APPROVAL");
  if (!device.publicKey) throw new AppError("This device has no cryptographic credential.", 400, "DEVICE_KEY_MISSING");
  const nonce = randomBytes(32).toString("hex");
  const timestamp = now.toISOString();
  const expiresAt = new Date(now.getTime() + DEVICE_CHALLENGE_TTL_MS).toISOString();
  challenges.set(nonce, { deviceId, nonce, timestamp, expiresAt, used: false });
  if (isDbConnected()) {
    await challengeRepository.create({
      nonce,
      walletAddress: `device:${deviceId}`,
      domain: "aegis.local",
      message: createDeviceLoginPayload({ deviceId, nonce, timestamp }),
      expiresAt: new Date(expiresAt),
      purpose: "device-login",
      createdAt: now,
    });
  }
  return { deviceId, nonce, timestamp, expiresAt, message: createDeviceLoginPayload({ deviceId, nonce, timestamp }) };
}

export async function verifyDeviceLogin(deviceId: string, nonce: string, timestamp: string, signature: string, now = new Date()) {
  let challenge = challenges.get(nonce);
  if (!challenge && isDbConnected()) {
    const stored = await challengeRepository.findByNonce(nonce);
    if (stored?.purpose === "device-login" && stored.walletAddress === `device:${deviceId}`) {
      const payload = stored.message.split("\n");
      challenge = {
        deviceId,
        nonce: stored.nonce,
        timestamp: payload[3] ?? timestamp,
        expiresAt: stored.expiresAt,
        used: stored.used,
      };
      challenges.set(nonce, challenge);
    }
  }
  if (!challenge || challenge.deviceId !== deviceId || challenge.timestamp !== timestamp) {
    throw new AppError("The device login challenge is invalid.", 400, "DEVICE_LOGIN_CHALLENGE_INVALID");
  }
  if (challenge.used) throw new AppError("The device login challenge has already been used.", 400, "DEVICE_LOGIN_CHALLENGE_REUSED");
  if (now >= new Date(challenge.expiresAt)) throw new AppError("The device login challenge expired.", 400, "DEVICE_LOGIN_CHALLENGE_EXPIRED");
  const device = getApprovedDevice(deviceId, getDevice(deviceId).identityId);
  if (!device.publicKey) throw new AppError("This device has no cryptographic credential.", 400, "DEVICE_KEY_MISSING");
  verifyDeviceLoginProof({ deviceId, nonce, timestamp, signature, publicKey: device.publicKey, now });
  if (isDbConnected()) {
    const consumed = await challengeRepository.consumeAtomic(nonce, now);
    if (!consumed) throw new AppError("The device login challenge has already been used or expired.", 400, "DEVICE_LOGIN_CHALLENGE_REUSED");
  }
  challenge.used = true;
  const identity = getIdentity(device.identityId);
  if (identity.status !== "ACTIVE") throw new AppError("The identity is revoked.", 403, "AUTH_IDENTITY_REVOKED");
  const { session, accessToken } = createSession(identity.identityId, now);
  const boundSession = bindSessionToDevice(session.sessionId, device.deviceId, identity.identityId);
  const rolePermissions = getPermissionsForRoles(identity.roles);
  const effectivePermissions = device.permissions.length
    ? rolePermissions.filter((permission) => device.permissions.includes(permission))
    : rolePermissions;
  return {
    walletAddress: identity.walletAddress,
    identity: {
      identityId: identity.identityId,
      walletAddress: identity.walletAddress,
      displayName: identity.displayName,
      status: identity.status,
      roles: identity.roles,
      permissions: effectivePermissions,
    },
    device: { deviceId: device.deviceId, name: device.name, permissions: effectivePermissions },
    session: { sessionId: boundSession.sessionId, accessToken, expiresAt: boundSession.expiresAt },
  };
}

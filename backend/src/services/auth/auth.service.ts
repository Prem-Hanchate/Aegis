import { randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import { AppError } from "../../middleware/AppError.js";
import { AUTH_DOMAIN, AUTH_PURPOSE, createAuthMessage, parseAuthMessage } from "./auth-message.js";
import { getChallenge, getChallengeAsync, markChallengeUsed, markChallengeUsedAtomic, saveChallenge, saveChallengeAsync } from "./challengeStore.js";
import type { AuthVerificationResult, IssuedLoginChallenge } from "./challenge.types.js";
import { getIdentityByWallet, getIdentityByWalletAsync } from "../identity.service.js";
import { createSession, createSessionAsync } from "../session.service.js";
import { enrollDeviceAsync } from "../device.service.js";
import { getPermissionsForRoles } from "../authorization/authorization.service.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { env } from "../../config/env.js";

const DEFAULT_NONCE_TTL_SECONDS = 5 * 60;

function normalizeWalletAddress(walletAddress: string) {
  try {
    return getAddress(walletAddress);
  } catch {
    throw new AppError("Invalid wallet address.", 400, "AUTH_INVALID_WALLET_ADDRESS");
  }
}

function toIsoString(date: Date) {
  return date.toISOString();
}

export function issueLoginChallenge(walletAddress: string, now = new Date()): IssuedLoginChallenge {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const nonce = randomBytes(32).toString("hex");
  const issuedAt = toIsoString(now);
  const expiresAt = toIsoString(new Date(now.getTime() + DEFAULT_NONCE_TTL_SECONDS * 1000));

  const payload = {
    nonce,
    walletAddress: normalizedWalletAddress,
    domain: AUTH_DOMAIN,
    issuedAt,
    expiresAt,
    purpose: AUTH_PURPOSE,
  };
  const message = createAuthMessage(payload);

  saveChallenge({
    ...payload,
    message,
    used: false,
    usedAt: null,
  });

  return {
    ...payload,
    message,
  };
}

export async function issueLoginChallengeAsync(walletAddress: string, now = new Date()): Promise<IssuedLoginChallenge> {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const nonce = randomBytes(32).toString("hex");
  const issuedAt = toIsoString(now);
  const expiresAt = toIsoString(new Date(now.getTime() + DEFAULT_NONCE_TTL_SECONDS * 1000));
  const payload = { nonce, walletAddress: normalizedWalletAddress, domain: AUTH_DOMAIN, issuedAt, expiresAt, purpose: AUTH_PURPOSE };
  await saveChallengeAsync({ ...payload, message: createAuthMessage(payload), used: false, usedAt: null });
  return { ...payload, message: createAuthMessage(payload) };
}

export function verifyLoginChallenge(
  walletAddress: string,
  message: string,
  signature: string,
  now = new Date(),
): AuthVerificationResult {
  const parsedMessage = parseAuthMessage(message);

  if (!parsedMessage) {
    throw new AppError("The authentication message is invalid.", 400, "AUTH_INVALID_MESSAGE");
  }

  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const challenge = getChallenge(parsedMessage.nonce);

  if (!challenge) {
    throw new AppError("The nonce could not be found.", 400, "AUTH_NONCE_NOT_FOUND");
  }

  if (challenge.used) {
    recordAuditEvent({
      eventType: "REPLAY_ATTEMPT",
      identityId: null,
      resource: "auth",
      action: "verify",
      outcome: "FAILURE",
      reason: "The nonce has already been used.",
      actor: normalizedWalletAddress,
    }, now);
    throw new AppError("The nonce has already been used.", 400, "AUTH_NONCE_REUSED");
  }

  if (parsedMessage.domain !== AUTH_DOMAIN || challenge.domain !== AUTH_DOMAIN) {
    throw new AppError("The authentication domain is invalid.", 400, "AUTH_DOMAIN_MISMATCH");
  }

  if (parsedMessage.walletAddress !== challenge.walletAddress || normalizedWalletAddress !== challenge.walletAddress) {
    throw new AppError("The wallet address does not match the challenge.", 400, "AUTH_WALLET_MISMATCH");
  }

  const expiresAt = new Date(challenge.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || now > expiresAt) {
    throw new AppError("The authentication nonce has expired.", 400, "AUTH_NONCE_EXPIRED");
  }

  let recoveredAddress: string;
  try {
    recoveredAddress = getAddress(verifyMessage(message, signature));
  } catch {
    recordAuditEvent({
      eventType: "INVALID_SIGNATURE",
      identityId: null,
      resource: "auth",
      action: "verify",
      outcome: "FAILURE",
      reason: "Cryptographic signature could not be verified.",
      actor: normalizedWalletAddress,
    }, now);
    throw new AppError("The signature is invalid.", 400, "AUTH_INVALID_SIGNATURE");
  }

  if (recoveredAddress !== challenge.walletAddress) {
    recordAuditEvent({
      eventType: "INVALID_SIGNATURE",
      identityId: null,
      resource: "auth",
      action: "verify",
      outcome: "FAILURE",
      reason: "Recovered signer address does not match challenge wallet.",
      actor: normalizedWalletAddress,
    }, now);
    throw new AppError("The signature does not match the registered wallet.", 400, "AUTH_INVALID_SIGNATURE");
  }

  const identity = getIdentityByWallet(challenge.walletAddress);
  if (!identity) {
    recordAuditEvent({
      eventType: "AUTH_FAILURE",
      identityId: null,
      resource: "auth",
      action: "verify",
      outcome: "FAILURE",
      reason: "No identity is registered for this wallet.",
      actor: challenge.walletAddress,
    }, now);
    throw new AppError("No identity is registered for this wallet.", 403, "AUTH_IDENTITY_NOT_FOUND");
  }
  if (identity.status !== "ACTIVE") {
    recordAuditEvent({
      eventType: "AUTH_FAILURE",
      identityId: identity.identityId,
      resource: "auth",
      action: "verify",
      outcome: "FAILURE",
      reason: "The identity is revoked.",
      actor: challenge.walletAddress,
    }, now);
    throw new AppError("The identity is revoked.", 403, "AUTH_IDENTITY_REVOKED");
  }

  markChallengeUsed(challenge.nonce, toIsoString(now));
  const { session, accessToken } = createSession(identity.identityId, now);

  recordAuditEvent({
    eventType: "AUTH_SUCCESS",
    identityId: identity.identityId,
    resource: "auth",
    action: "verify",
    outcome: "SUCCESS",
    reason: "Wallet signature verified and session issued.",
    actor: challenge.walletAddress,
  }, now);

  return {
    walletAddress: challenge.walletAddress,
    nonce: challenge.nonce,
    domain: challenge.domain,
    identity: {
      identityId: identity.identityId,
      walletAddress: identity.walletAddress,
      displayName: identity.displayName,
      status: identity.status,
      roles: identity.roles,
      permissions: getPermissionsForRoles(identity.roles),
    },
    session: {
      sessionId: session.sessionId,
      accessToken,
      expiresAt: session.expiresAt,
    },
  };
}

export async function verifyLoginChallengeAsync(
  walletAddress: string,
  message: string,
  signature: string,
  now = new Date(),
): Promise<AuthVerificationResult> {
  const parsedMessage = parseAuthMessage(message);
  if (!parsedMessage) throw new AppError("The authentication message is invalid.", 400, "AUTH_INVALID_MESSAGE");
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const challenge = await getChallengeAsync(parsedMessage.nonce);
  if (!challenge) throw new AppError("The nonce could not be found.", 400, "AUTH_NONCE_NOT_FOUND");
  if (challenge.used) throw new AppError("The nonce has already been used.", 400, "AUTH_NONCE_REUSED");
  if (parsedMessage.domain !== challenge.domain || challenge.domain !== AUTH_DOMAIN) {
    throw new AppError("The authentication domain is invalid.", 400, "AUTH_DOMAIN_MISMATCH");
  }
  if (parsedMessage.walletAddress !== challenge.walletAddress || normalizedWalletAddress !== challenge.walletAddress) {
    throw new AppError("The wallet address does not match the challenge.", 400, "AUTH_WALLET_MISMATCH");
  }
  if (new Date(challenge.expiresAt).getTime() <= now.getTime()) {
    throw new AppError("The authentication nonce has expired.", 400, "AUTH_NONCE_EXPIRED");
  }
  let recoveredAddress: string;
  try {
    recoveredAddress = getAddress(verifyMessage(message, signature));
  } catch {
    throw new AppError("The signature is invalid.", 400, "AUTH_INVALID_SIGNATURE");
  }
  if (recoveredAddress !== challenge.walletAddress) {
    throw new AppError("The signature does not match the registered wallet.", 400, "AUTH_INVALID_SIGNATURE");
  }
  const identity = await getIdentityByWalletAsync(challenge.walletAddress);
  if (!identity) throw new AppError("No identity is registered for this wallet.", 403, "AUTH_IDENTITY_NOT_FOUND");
  if (identity.status !== "ACTIVE") throw new AppError("The identity is revoked.", 403, "AUTH_IDENTITY_REVOKED");
  const consumed = await markChallengeUsedAtomic(challenge.nonce, toIsoString(now));
  if (!consumed) throw new AppError("The nonce has already been used.", 400, "AUTH_NONCE_REUSED");
  const { session, accessToken } = await createSessionAsync(identity.identityId, now);
  const isBootstrapAdmin = identity.walletAddress.toLowerCase() === env.bootstrapAdminWallet.toLowerCase();
  if (isBootstrapAdmin) {
    await enrollDeviceAsync(
      identity.identityId,
      session.sessionId,
      "Bootstrap administrator workstation",
      env.bootstrapAdminDeviceFingerprint,
      now,
      null,
      { accessLevel: "UNRESTRICTED", isApproved: true },
    );
  }
  return {
    walletAddress: challenge.walletAddress,
    nonce: challenge.nonce,
    domain: challenge.domain,
    identity: { ...identity, permissions: getPermissionsForRoles(identity.roles) },
    session: { sessionId: session.sessionId, accessToken, expiresAt: session.expiresAt },
  };
}

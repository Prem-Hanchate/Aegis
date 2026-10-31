import { randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import { AppError } from "../../middleware/AppError.js";
import { AUTH_DOMAIN, AUTH_PURPOSE, createAuthMessage, parseAuthMessage } from "./auth-message.js";
import { getChallenge, markChallengeUsed, saveChallenge } from "./challengeStore.js";
import type { AuthVerificationResult, IssuedLoginChallenge } from "./challenge.types.js";
import { getIdentityByWallet } from "../identity.service.js";
import { createSession } from "../session.service.js";
import { getPermissionsForRoles } from "../authorization/authorization.service.js";

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

export async function issueLoginChallenge(walletAddress: string, now = new Date()): Promise<IssuedLoginChallenge> {
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

  await saveChallenge({
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

export async function verifyLoginChallenge(
  walletAddress: string,
  message: string,
  signature: string,
  now = new Date(),
): Promise<AuthVerificationResult> {
  const parsedMessage = parseAuthMessage(message);

  if (!parsedMessage) {
    throw new AppError("The authentication message is invalid.", 400, "AUTH_INVALID_MESSAGE");
  }

  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  const challenge = await getChallenge(parsedMessage.nonce);

  if (!challenge) {
    throw new AppError("The nonce could not be found.", 400, "AUTH_NONCE_NOT_FOUND");
  }

  if (challenge.used) {
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
    throw new AppError("The signature is invalid.", 400, "AUTH_INVALID_SIGNATURE");
  }

  if (recoveredAddress !== challenge.walletAddress) {
    throw new AppError("The signature does not match the registered wallet.", 400, "AUTH_INVALID_SIGNATURE");
  }

  const identity = await getIdentityByWallet(challenge.walletAddress);
  if (!identity) {
    throw new AppError("No identity is registered for this wallet.", 403, "AUTH_IDENTITY_NOT_FOUND");
  }
  if (identity.status !== "ACTIVE") {
    throw new AppError("The identity is revoked.", 403, "AUTH_IDENTITY_REVOKED");
  }

  const claimedChallenge = await markChallengeUsed(challenge.nonce, toIsoString(now));
  if (!claimedChallenge) {
    throw new AppError("The nonce has already been used.", 400, "AUTH_NONCE_REUSED");
  }
  const { session, accessToken } = await createSession(identity.identityId, now);

  return {
    walletAddress: challenge.walletAddress,
    nonce: challenge.nonce,
    domain: challenge.domain,
    identity: {
      identityId: identity.identityId,
      displayName: identity.displayName,
      status: identity.status,
      roles: identity.roles,
      permissions: await getPermissionsForRoles(identity.roles),
    },
    session: {
      sessionId: session.sessionId,
      accessToken,
      expiresAt: session.expiresAt,
    },
  };
}
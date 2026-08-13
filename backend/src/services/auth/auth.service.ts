import { randomBytes } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import { AppError } from "../../middleware/AppError.js";
import { AUTH_DOMAIN, AUTH_PURPOSE, createAuthMessage, parseAuthMessage } from "./auth-message.js";
import { getChallenge, markChallengeUsed, saveChallenge } from "./challengeStore.js";
import type { AuthVerificationResult, IssuedLoginChallenge } from "./challenge.types.js";

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

  markChallengeUsed(challenge.nonce, toIsoString(now));

  return {
    walletAddress: challenge.walletAddress,
    nonce: challenge.nonce,
    domain: challenge.domain,
  };
}
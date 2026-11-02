import { createPublicKey, verify as verifySignature } from "node:crypto";
import { AppError } from "../middleware/AppError.js";

const DEVICE_PROOF_MAX_AGE_MS = 60 * 1000;

export function createDeviceLoginPayload(input: {
  deviceId: string;
  nonce: string;
  timestamp: string;
}) {
  return [
    "Aegis-Device-Login:v1",
    input.deviceId,
    input.nonce,
    input.timestamp,
  ].join("\n");
}

export function createDeviceProofPayload(input: {
  deviceId: string;
  sessionId: string;
  timestamp: string;
  method: string;
  path: string;
}) {
  return [
    "Aegis-Device-Proof:v1",
    input.deviceId,
    input.sessionId,
    input.timestamp,
    input.method.toUpperCase(),
    input.path,
  ].join("\n");
}

export function verifyDeviceProof(input: {
  deviceId: string;
  sessionId: string;
  timestamp: string;
  method: string;
  path: string;
  signature: string;
  publicKey: string;
  now?: Date;
}) {
  const timestampMs = Date.parse(input.timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs((input.now ?? new Date()).getTime() - timestampMs) > DEVICE_PROOF_MAX_AGE_MS) {
    throw new AppError("The device proof is stale or invalid.", 403, "DEVICE_PROOF_STALE");
  }

  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey({ key: JSON.parse(input.publicKey), format: "jwk" });
  } catch {
    throw new AppError("The device public key is invalid.", 400, "DEVICE_PUBLIC_KEY_INVALID");
  }

  let signature: Buffer;
  try {
    signature = Buffer.from(input.signature, "base64url");
  } catch {
    throw new AppError("The device proof signature is invalid.", 403, "DEVICE_PROOF_INVALID");
  }

  const payload = createDeviceProofPayload(input);
  const valid = verifySignature("sha256", Buffer.from(payload), publicKey, signature);
  if (!valid) {
    throw new AppError("The device proof signature is invalid.", 403, "DEVICE_PROOF_INVALID");
  }
}

export const deviceProofMaxAgeMs = DEVICE_PROOF_MAX_AGE_MS;

export function verifyDeviceLoginProof(input: {
  deviceId: string;
  nonce: string;
  timestamp: string;
  signature: string;
  publicKey: string;
  now?: Date;
}) {
  const timestampMs = Date.parse(input.timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs((input.now ?? new Date()).getTime() - timestampMs) > DEVICE_PROOF_MAX_AGE_MS) {
    throw new AppError("The device login proof is stale or invalid.", 403, "DEVICE_LOGIN_PROOF_STALE");
  }
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey({ key: JSON.parse(input.publicKey), format: "jwk" });
  } catch {
    throw new AppError("The device public key is invalid.", 400, "DEVICE_PUBLIC_KEY_INVALID");
  }
  const signature = Buffer.from(input.signature, "base64url");
  const payload = createDeviceLoginPayload(input);
  if (!verifySignature("sha256", Buffer.from(payload), publicKey, signature)) {
    throw new AppError("The device login proof is invalid.", 403, "DEVICE_LOGIN_PROOF_INVALID");
  }
}

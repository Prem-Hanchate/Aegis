import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/middleware/AppError.js";
import { createDeviceProofPayload, verifyDeviceProof } from "../src/services/device-proof.service.js";

describe("device proof verification", () => {
  it("accepts a current signature from the registered device key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "jwk" },
    });
    const timestamp = new Date().toISOString();
    const input = {
      deviceId: "device-1",
      sessionId: "session-1",
      timestamp,
      method: "GET",
      path: "/resources/reports",
    };
    const signature = sign("sha256", Buffer.from(createDeviceProofPayload(input)), privateKey).toString("base64url");

    expect(() => verifyDeviceProof({
      ...input,
      signature,
      publicKey: JSON.stringify(publicKey),
    })).not.toThrow();
  });

  it("rejects a stale proof", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "jwk" },
    });
    const timestamp = new Date(Date.now() - 61_000).toISOString();
    const input = {
      deviceId: "device-1",
      sessionId: "session-1",
      timestamp,
      method: "GET",
      path: "/resources/reports",
    };
    const signature = sign("sha256", Buffer.from(createDeviceProofPayload(input)), privateKey).toString("base64url");

    expect(() => verifyDeviceProof({
      ...input,
      signature,
      publicKey: JSON.stringify(publicKey),
    })).toThrowError(new AppError("The device proof is stale or invalid.", 403, "DEVICE_PROOF_STALE"));
  });
});

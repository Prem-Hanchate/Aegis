import { createSign, generateKeyPairSync } from "node:crypto";
import { Wallet } from "ethers";
import { beforeEach, describe, expect, it } from "vitest";
import { issueDeviceLoginChallenge, verifyDeviceLogin } from "../src/services/auth/device-auth.service.js";
import { createDeviceLoginPayload, createDeviceProofPayload } from "../src/services/device-proof.service.js";
import {
  approveDevice,
  requestDevicePairing,
  resetDeviceMemoryStore,
  revokeDeviceDirect,
  updateDevicePermissions,
} from "../src/services/device.service.js";
import { assignRole, clearIdentityStore, registerIdentity } from "../src/services/identity.service.js";
import { clearSessionStore } from "../src/services/session.service.js";
import { clearAuthorizationState, grantRolePermission } from "../src/services/authorization/authorization.service.js";
import { evaluateZeroTrustAuthorization } from "../src/services/authorization/zero-trust.service.js";

describe("device-only account authentication", () => {
  beforeEach(() => {
    clearIdentityStore();
    clearSessionStore();
    resetDeviceMemoryStore();
    clearAuthorizationState();
  });

  it("creates a device-bound session without a wallet signature", async () => {
    const wallet = Wallet.createRandom();
    const identity = registerIdentity(wallet.address, "Device User");
    assignRole(identity.identityId, "employee");
    grantRolePermission("employee", "reports", "read");

    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      privateKeyEncoding: { type: "pkcs8", format: "jwk" },
      publicKeyEncoding: { type: "spki", format: "jwk" },
    });
    const device = requestDevicePairing(identity.identityId, "Phone", JSON.stringify(publicKey));
    approveDevice(device.deviceId, "administrator");

    const challenge = await issueDeviceLoginChallenge(device.deviceId);
    const signer = createSign("sha256");
    signer.update(createDeviceLoginPayload(challenge));
    signer.end();
    const signature = signer.sign({ key: privateKey, format: "jwk" }).toString("base64url");
    const result = await verifyDeviceLogin(device.deviceId, challenge.nonce, challenge.timestamp, signature);

    expect(result.identity.identityId).toBe(identity.identityId);
    expect(result.session.sessionId).toBeTruthy();
    expect(result.device.deviceId).toBe(device.deviceId);
  });

  it("enforces explicit permissions assigned to the device", async () => {
    const wallet = Wallet.createRandom();
    const identity = registerIdentity(wallet.address, "Restricted User");
    assignRole(identity.identityId, "manager");
    grantRolePermission("manager", "payroll", "read");

    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      privateKeyEncoding: { type: "pkcs8", format: "jwk" },
      publicKeyEncoding: { type: "spki", format: "jwk" },
    });
    const device = requestDevicePairing(identity.identityId, "Read-only phone", JSON.stringify(publicKey));
    approveDevice(device.deviceId, "administrator");
    updateDevicePermissions(device.deviceId, identity.identityId, ["reports:read"]);

    const challenge = await issueDeviceLoginChallenge(device.deviceId);
    const signer = createSign("sha256");
    signer.update(createDeviceLoginPayload(challenge));
    signer.end();
    const signature = signer.sign({ key: privateKey, format: "jwk" }).toString("base64url");
    const result = await verifyDeviceLogin(device.deviceId, challenge.nonce, challenge.timestamp, signature);

    const proofTimestamp = new Date().toISOString();
    const proofSigner = createSign("sha256");
    proofSigner.update(createDeviceProofPayload({
      deviceId: device.deviceId,
      sessionId: result.session.sessionId,
      timestamp: proofTimestamp,
      method: "GET",
      path: "/api/resources/payroll",
    }));
    proofSigner.end();
    const proofSignature = proofSigner.sign({ key: privateKey, format: "jwk" }).toString("base64url");

    await expect(evaluateZeroTrustAuthorization({
      accessToken: result.session.accessToken,
      resource: "payroll",
      action: "read",
      context: {
        deviceProofTimestamp: proofTimestamp,
        deviceProofSignature: proofSignature,
        requestMethod: "GET",
        requestPath: "/api/resources/payroll",
      },
    })).rejects.toThrow("Access denied.");
  });

  it("invalidates a user's device session when an administrator revokes that device", async () => {
    const wallet = Wallet.createRandom();
    const identity = registerIdentity(wallet.address, "Managed User");
    assignRole(identity.identityId, "employee");
    grantRolePermission("employee", "employee", "read");
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      privateKeyEncoding: { type: "pkcs8", format: "jwk" },
      publicKeyEncoding: { type: "spki", format: "jwk" },
    });
    const device = requestDevicePairing(identity.identityId, "Managed phone", JSON.stringify(publicKey));
    approveDevice(device.deviceId, "administrator");
    const challenge = await issueDeviceLoginChallenge(device.deviceId);
    const signer = createSign("sha256");
    signer.update(createDeviceLoginPayload(challenge));
    signer.end();
    const signature = signer.sign({ key: privateKey, format: "jwk" }).toString("base64url");
    const result = await verifyDeviceLogin(device.deviceId, challenge.nonce, challenge.timestamp, signature);

    revokeDeviceDirect(device.deviceId);

    await expect(issueDeviceLoginChallenge(device.deviceId)).rejects.toThrow("revoked");
    await expect(evaluateZeroTrustAuthorization({
      accessToken: result.session.accessToken,
      resource: "employee",
      action: "read",
    })).rejects.toThrow(/revoked/i);
  });
});

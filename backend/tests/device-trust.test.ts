import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  approveDevice,
  getApprovedDevice,
  requestDevicePairing,
  resetDeviceMemoryStore,
} from "../src/services/device.service.js";

describe("cryptographic device lifecycle", () => {
  beforeEach(() => {
    resetDeviceMemoryStore();
  });

  it("keeps a paired device pending until an administrator approves it", () => {
    const { publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "jwk" },
    });
    const device = requestDevicePairing("identity-1", "Office workstation", JSON.stringify(publicKey));

    expect(device.approvalStatus).toBe("PENDING");
    expect(() => getApprovedDevice(device.deviceId, "identity-1")).toThrow("administrator approval");

    const approved = approveDevice(device.deviceId, "admin-identity");
    expect(approved.approvalStatus).toBe("APPROVED");
    expect(approved.approvedBy).toBe("admin-identity");
  });
});

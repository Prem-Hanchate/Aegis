import { afterEach, describe, expect, it } from "vitest";
import {
  clearBrowserDevice,
  createBrowserDeviceKey,
  getBrowserDevice,
  signBrowserDeviceProof,
  storeBrowserDevice,
} from "../src/services/device-crypto";

afterEach(() => {
  clearBrowserDevice();
});

describe("browser device cryptography", () => {
  it("creates and persists a device key without exposing the private key in the public key", () => {
    const key = createBrowserDeviceKey("Phone");
    const device = storeBrowserDevice({ ...key, deviceId: "device-1" });

    expect(getBrowserDevice()).toEqual(device);
    expect(key.privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(key.publicKey).not.toContain(key.privateKey);
  });

  it("signs a proof using the locally stored device key", () => {
    const key = createBrowserDeviceKey("Phone");
    storeBrowserDevice({ ...key, deviceId: "device-1" });

    const proof = signBrowserDeviceProof({
      sessionId: "session-1",
      method: "GET",
      path: "/api/resources/reports",
      timestamp: new Date().toISOString(),
    });

    expect(proof?.deviceId).toBe("device-1");
    expect(proof?.signature).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

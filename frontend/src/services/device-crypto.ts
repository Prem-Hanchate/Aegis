import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha256";

const DEVICE_STORAGE_KEY = "aegis.browser.device";

interface StoredBrowserDevice {
  deviceId: string;
  privateKey: string;
  publicKey: string;
  name: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function hexToBytes(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{1,2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
}

function getStoredDevice(): StoredBrowserDevice | null {
  const raw = localStorage.getItem(DEVICE_STORAGE_KEY);
  return raw ? JSON.parse(raw) as StoredBrowserDevice : null;
}

export function getBrowserDevice() {
  return getStoredDevice();
}

export function storeBrowserDevice(device: StoredBrowserDevice) {
  localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(device));
  return device;
}

export function clearBrowserDevice() {
  localStorage.removeItem(DEVICE_STORAGE_KEY);
}

export function createBrowserDeviceKey(name: string) {
  let privateKey: Uint8Array;
  do {
    privateKey = crypto.getRandomValues(new Uint8Array(32));
  } while (!p256.utils.isValidPrivateKey(privateKey));

  const publicKey = p256.getPublicKey(privateKey, false);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(publicKey.slice(1, 33)),
    y: bytesToBase64Url(publicKey.slice(33)),
  };

  return {
    privateKey: Array.from(privateKey).map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    publicKey: JSON.stringify(jwk),
    name,
  };
}

export function signBrowserDeviceProof(input: {
  sessionId: string;
  method: string;
  path: string;
  timestamp: string;
}) {
  const device = getStoredDevice();
  if (!device) return null;
  const payload = [
    "Aegis-Device-Proof:v1",
    device.deviceId,
    input.sessionId,
    input.timestamp,
    input.method.toUpperCase(),
    input.path,
  ].join("\n");
  const signature = p256.sign(sha256(new TextEncoder().encode(payload)), hexToBytes(device.privateKey));
  return {
    deviceId: device.deviceId,
    timestamp: input.timestamp,
    signature: bytesToBase64Url(signature.toDERRawBytes()),
  };
}

export function signBrowserDeviceLogin(input: { nonce: string; timestamp: string }) {
  const device = getStoredDevice();
  if (!device) return null;
  const payload = [
    "Aegis-Device-Login:v1",
    device.deviceId,
    input.nonce,
    input.timestamp,
  ].join("\n");
  const signature = p256.sign(sha256(new TextEncoder().encode(payload)), hexToBytes(device.privateKey));
  return { deviceId: device.deviceId, timestamp: input.timestamp, signature: bytesToBase64Url(signature.toDERRawBytes()) };
}

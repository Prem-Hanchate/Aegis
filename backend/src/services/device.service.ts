import { randomUUID } from "node:crypto";
import { AppError } from "../middleware/AppError.js";
import { deviceRepository } from "../repositories/index.js";
import { attachDeviceToSession } from "./session.service.js";

export type DeviceStatus = "ACTIVE" | "REVOKED";
export interface Device { deviceId: string; identityId: string; name: string; fingerprint: string; status: DeviceStatus; createdAt: string; lastSeenAt: string; revokedAt: string | null; }

export async function enrollDevice(identityId: string, sessionId: string, name: string, fingerprint: string, now = new Date()) {
  const normalizedFingerprint = fingerprint.trim();
  if (!name.trim() || !normalizedFingerprint) throw new AppError("Device name and fingerprint are required.", 400, "DEVICE_INVALID_INPUT");
  const existing = await deviceRepository.findActiveByFingerprint(identityId, normalizedFingerprint);
  if (existing) { await attachDeviceToSession(sessionId, existing.deviceId); return existing; }
  const timestamp = now.toISOString();
  let device: Device;
  try {
    device = await deviceRepository.create({ deviceId: randomUUID(), identityId, name: name.trim(), fingerprint: normalizedFingerprint, status: "ACTIVE", createdAt: timestamp, lastSeenAt: timestamp, revokedAt: null });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      const concurrentDevice = await deviceRepository.findActiveByFingerprint(identityId, normalizedFingerprint);
      if (concurrentDevice) {
        await attachDeviceToSession(sessionId, concurrentDevice.deviceId);
        return concurrentDevice;
      }
    }
    throw error;
  }
  await attachDeviceToSession(sessionId, device.deviceId);
  return device;
}

export async function getDevice(deviceId: string) {
  const device = await deviceRepository.findById(deviceId);
  if (!device) throw new AppError("Device not found.", 404, "DEVICE_NOT_FOUND");
  return device;
}
export async function getActiveDevice(deviceId: string, identityId: string) {
  const device = await getDevice(deviceId);
  if (device.identityId !== identityId) throw new AppError("The device does not belong to this identity.", 403, "DEVICE_IDENTITY_MISMATCH");
  if (device.status !== "ACTIVE") throw new AppError("The device is revoked.", 403, "DEVICE_REVOKED");
  return device;
}
export async function listDevicesForIdentity(identityId: string) { return deviceRepository.listByIdentity(identityId); }
export async function listDevicesForIdentityWithFilter(identityId: string, filter: { status?: DeviceStatus; seenSince?: Date } = {}) { return deviceRepository.listByIdentity(identityId, filter); }
export async function revokeDevice(deviceId: string, identityId: string, now = new Date()) {
  await getActiveDevice(deviceId, identityId);
  const device = await deviceRepository.revoke(deviceId, now);
  if (!device) throw new AppError("The device is revoked.", 403, "DEVICE_REVOKED");
  return device;
}
export async function replaceDevice(deviceId: string, identityId: string, sessionId: string, name: string, fingerprint: string) {
  await revokeDevice(deviceId, identityId);
  return enrollDevice(identityId, sessionId, name, fingerprint);
}
export async function clearDeviceStore() {
  if (process.env.NODE_ENV !== "test") throw new AppError("Device store clearing is only available in tests.", 403, "TEST_ONLY_OPERATION");
  await deviceRepository.clear();
}
export async function touchDevice(deviceId: string, identityId: string, now = new Date()) {
  await getActiveDevice(deviceId, identityId);
  const device = await deviceRepository.touch(deviceId, now);
  if (!device) throw new AppError("The device is revoked.", 403, "DEVICE_REVOKED");
  return device;
}

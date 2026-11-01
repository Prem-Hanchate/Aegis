import { pendingDeviceCreations } from "../models/device.model.js";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { AppError } from "../middleware/AppError.js";
import { attachDeviceToSession, revokeSessionsForDevice } from "./session.service.js";
import { deviceRepository } from "../repositories/device.repository.js";

export type DeviceStatus = "ACTIVE" | "REVOKED";

export interface Device {
  deviceId: string;
  identityId: string;
  name: string;
  deviceName?: string;
  fingerprint: string;
  publicKey: string | null;
  permissions: string[];
  approvalStatus: "LEGACY" | "PENDING" | "APPROVED";
  approvedAt: string | null;
  approvedBy: string | null;
  status: DeviceStatus;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  replacementOf?: string | null;
}

const devices = new Map<string, Device>();

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function enrollDevice(
  identityId: string,
  sessionId: string,
  name: string,
  fingerprint: string,
  now = new Date(),
  replacementOf: string | null = null,
): Device {
  const normalizedFingerprint = fingerprint.trim();
  const normalizedName = name.trim();
  if (!normalizedName || !normalizedFingerprint) {
    throw new AppError("Device name and fingerprint are required.", 400, "DEVICE_INVALID_INPUT");
  }

  const existing = [...devices.values()].find(
    (device) => device.identityId === identityId && device.fingerprint === normalizedFingerprint && device.status === "ACTIVE",
  );
  if (existing) {
    attachDeviceToSession(sessionId, existing.deviceId);
    return existing;
  }

  const timestamp = now.toISOString();
  const device: Device = {
    deviceId: randomUUID(),
    identityId,
    name: normalizedName,
    deviceName: normalizedName,
    fingerprint: normalizedFingerprint,
    publicKey: null,
    permissions: [],
    approvalStatus: "LEGACY",
    approvedAt: null,
    approvedBy: null,
    status: "ACTIVE",
    createdAt: timestamp,
    lastSeenAt: timestamp,
    revokedAt: null,
    replacementOf,
  };

  devices.set(device.deviceId, device);
  attachDeviceToSession(sessionId, device.deviceId);

  if (isDbConnected()) {
    const creationPromise = deviceRepository.create({
      deviceId: device.deviceId,
      identityId,
      name: normalizedName,
      fingerprint: normalizedFingerprint,
      publicKey: null,
      permissions: [],
      approvalStatus: "LEGACY",
      status: "ACTIVE",
      createdAt: now,
      lastSeenAt: now,
      replacementOf,
    }).catch((err) => {
      console.error("Failed to persist device to MongoDB:", err);
    });
    pendingDeviceCreations.set(device.deviceId, creationPromise);
    creationPromise.finally(() => pendingDeviceCreations.delete(device.deviceId));
  }

  return device;
}

export async function enrollDeviceAsync(
  identityId: string,
  sessionId: string,
  name: string,
  fingerprint: string,
  now = new Date(),
  replacementOf: string | null = null,
): Promise<Device> {
  const normalizedFingerprint = fingerprint.trim();
  const normalizedName = name.trim();
  if (!normalizedName || !normalizedFingerprint) {
    throw new AppError("Device name and fingerprint are required.", 400, "DEVICE_INVALID_INPUT");
  }

  if (isDbConnected()) {
    const existing = await deviceRepository.findActiveByFingerprint(identityId, normalizedFingerprint);
    if (existing) {
      devices.set(existing.deviceId, existing);
      attachDeviceToSession(sessionId, existing.deviceId);
      return existing;
    }

    const deviceId = randomUUID();
    const created = await deviceRepository.create({
      deviceId,
      identityId,
      name: normalizedName,
      fingerprint: normalizedFingerprint,
      publicKey: null,
      approvalStatus: "LEGACY",
      status: "ACTIVE",
      createdAt: now,
      lastSeenAt: now,
      replacementOf,
    });
    devices.set(created.deviceId, created);
    attachDeviceToSession(sessionId, created.deviceId);
    return created;
  }

  return enrollDevice(identityId, sessionId, name, fingerprint, now, replacementOf);
}

export function requestDevicePairing(
  identityId: string,
  name: string,
  publicKey: string,
  now = new Date(),
): Device {
  const normalizedName = name.trim();
  const normalizedKey = publicKey.trim();
  if (!normalizedName || !normalizedKey) {
    throw new AppError("Device name and public key are required.", 400, "DEVICE_INVALID_PAIRING");
  }
  const timestamp = now.toISOString();
  const device: Device = {
    deviceId: randomUUID(),
    identityId,
    name: normalizedName,
    deviceName: normalizedName,
    fingerprint: "",
    publicKey: normalizedKey,
    permissions: [],
    approvalStatus: "PENDING",
    approvedAt: null,
    approvedBy: null,
    status: "ACTIVE",
    createdAt: timestamp,
    lastSeenAt: timestamp,
    revokedAt: null,
    replacementOf: null,
  };
  devices.set(device.deviceId, device);
  if (isDbConnected()) {
    void deviceRepository.create({
      deviceId: device.deviceId,
      identityId,
      name: normalizedName,
      fingerprint: "",
      publicKey: normalizedKey,
      permissions: [],
      approvalStatus: "PENDING",
      createdAt: now,
      lastSeenAt: now,
    }).catch((err) => console.error("Failed to persist pending device:", err));
  }
  return device;
}

export function approveDevice(deviceId: string, approvedBy: string, now = new Date()): Device {
  const device = getDevice(deviceId);
  if (device.status !== "ACTIVE") throw new AppError("The device is revoked.", 403, "DEVICE_REVOKED");
  if (device.approvalStatus !== "PENDING") {
    throw new AppError("The device is not pending approval.", 409, "DEVICE_NOT_PENDING");
  }
  const approved: Device = { ...device, approvalStatus: "APPROVED", approvedAt: now.toISOString(), approvedBy };
  devices.set(deviceId, approved);
  if (isDbConnected()) {
    void deviceRepository.approve(deviceId, approvedBy, now).catch((err) => console.error("Failed to approve device:", err));
  }
  return approved;
}

export function getDevice(deviceId: string) {
  const device = devices.get(deviceId);
  if (!device) {
    throw new AppError("Device not found.", 404, "DEVICE_NOT_FOUND");
  }
  return device;
}

export async function getDeviceAsync(deviceId: string): Promise<Device> {
  if (isDbConnected()) {
    const doc = await deviceRepository.findById(deviceId);
    if (!doc) {
      throw new AppError("Device not found.", 404, "DEVICE_NOT_FOUND");
    }
    devices.set(doc.deviceId, doc);
    return doc;
  }
  return getDevice(deviceId);
}

export function getActiveDevice(deviceId: string, identityId: string) {
  const device = getDevice(deviceId);
  if (device.identityId !== identityId) {
    throw new AppError("The device does not belong to this identity.", 403, "DEVICE_IDENTITY_MISMATCH");
  }
  if (device.status !== "ACTIVE") {
    throw new AppError("The device is revoked.", 403, "DEVICE_REVOKED");
  }
  return device;
}

export function getApprovedDevice(deviceId: string, identityId: string) {
  const device = getActiveDevice(deviceId, identityId);
  if (device.approvalStatus === "PENDING") {
    throw new AppError("The device is awaiting administrator approval.", 403, "DEVICE_PENDING_APPROVAL");
  }

  return device;
}

export function updateDevicePermissions(
  deviceId: string,
  identityId: string,
  permissions: string[],
  allowedPermissions: string[] = [],
): Device {
  const device = getApprovedDevice(deviceId, identityId);
  const normalized = [...new Set(permissions.map((permission) => permission.trim()).filter(Boolean))];
  const allowed = new Set(allowedPermissions);
  if (normalized.some((permission) => !allowed.has(permission))) {
    throw new AppError(
      "A device cannot be granted permissions outside the account authorization.",
      403,
      "DEVICE_PERMISSION_ESCALATION",
    );
  }
  const updated = { ...device, permissions: normalized };
  devices.set(deviceId, updated);
  if (isDbConnected()) {
    void deviceRepository.updatePermissions(deviceId, normalized).catch((err) => {
      console.error("Failed to update device permissions in MongoDB:", err);
    });
  }
  return updated;
}

export function listDevicesForIdentity(identityId: string) {
  return [...devices.values()].filter((device) => device.identityId === identityId);
}

export function listAllDevices() {
  return [...devices.values()];
}

export async function listAllDevicesAsync() {
  if (isDbConnected()) {
    const all = await deviceRepository.listAll();
    for (const device of all) devices.set(device.deviceId, device);
    return all;
  }
  return listAllDevices();
}

export function listDevicesForIdentityWithFilter(
  identityId: string,
  filter: { status?: DeviceStatus; seenSince?: Date } = {},
) {
  return listDevicesForIdentity(identityId).filter((device) => {
    return (!filter.status || device.status === filter.status)
      && (!filter.seenSince || new Date(device.lastSeenAt) >= filter.seenSince);
  });
}

export function revokeDevice(deviceId: string, identityId: string, now = new Date()): Device {
  const device = getActiveDevice(deviceId, identityId);
  const revokedDevice: Device = { ...device, status: "REVOKED" as const, revokedAt: now.toISOString() };
  devices.set(deviceId, revokedDevice);

  if (isDbConnected()) {
    void deviceRepository.revoke(deviceId, identityId, now).catch((err) => {
      console.error("Failed to revoke device in MongoDB:", err);
    });
  }

  return revokedDevice;
}

export async function revokeDeviceAsync(deviceId: string, identityId: string, now = new Date()): Promise<Device> {
  const device = getActiveDevice(deviceId, identityId);
  const revokedDevice: Device = { ...device, status: "REVOKED" as const, revokedAt: now.toISOString() };
  devices.set(deviceId, revokedDevice);

  if (isDbConnected()) {
    const updated = await deviceRepository.revoke(deviceId, identityId, now);
    if (updated) {
      devices.set(updated.deviceId, updated);
      return updated;
    }
  }

  return revokedDevice;
}

export function revokeDeviceDirect(deviceId: string, now = new Date()): Device | null {
  const device = devices.get(deviceId);
  if (device) {
    const revokedDevice: Device = { ...device, status: "REVOKED" as const, revokedAt: now.toISOString() };
    devices.set(deviceId, revokedDevice);
  }
  revokeSessionsForDevice(deviceId, now);

  if (isDbConnected()) {
    void deviceRepository.revokeDirect(deviceId, now).catch((err) => {
      console.error("Failed to directly revoke device in MongoDB:", err);
    });
  }

  return device ? { ...device, status: "REVOKED" as const, revokedAt: now.toISOString() } : null;
}

export function revokeDevicesForIdentity(identityId: string, now = new Date()): number {
  const identityDevices = listDevicesForIdentity(identityId).filter((device) => device.status === "ACTIVE");
  for (const device of identityDevices) {
    revokeDeviceDirect(device.deviceId, now);
  }
  return identityDevices.length;
}

export async function revokeDeviceDirectAsync(deviceId: string, now = new Date()): Promise<Device | null> {
  let device = devices.get(deviceId) ?? null;
  if (isDbConnected()) {
    const updated = await deviceRepository.revokeDirect(deviceId, now);
    if (updated) {
      devices.set(updated.deviceId, updated);
      revokeSessionsForDevice(updated.deviceId, now);
      return updated;
    }
  }

  if (device) {
    const revokedDevice: Device = { ...device, status: "REVOKED" as const, revokedAt: now.toISOString() };
    devices.set(deviceId, revokedDevice);
    revokeSessionsForDevice(deviceId, now);
    return revokedDevice;
  }
  return null;
}

export function replaceDevice(deviceId: string, identityId: string, sessionId: string, name: string, fingerprint: string): Device {
  revokeDevice(deviceId, identityId);
  return enrollDevice(identityId, sessionId, name, fingerprint, new Date(), deviceId);
}

export async function replaceDeviceAsync(deviceId: string, identityId: string, sessionId: string, name: string, fingerprint: string): Promise<Device> {
  await revokeDeviceAsync(deviceId, identityId);
  return await enrollDeviceAsync(identityId, sessionId, name, fingerprint, new Date(), deviceId);
}

export function resetDeviceMemoryStore() {
  devices.clear();
}

export function clearDeviceStore() {
  devices.clear();
  if (isDbConnected()) {
    void deviceRepository.clear().catch((err) => {
      console.error("Failed to clear devices in MongoDB:", err);
    });
  }
}

export function touchDevice(deviceId: string, identityId: string, now = new Date()): Device {
  const device = getActiveDevice(deviceId, identityId);
  const updatedDevice: Device = { ...device, lastSeenAt: now.toISOString() };
  devices.set(deviceId, updatedDevice);

  if (isDbConnected()) {
    void deviceRepository.touch(deviceId, identityId, now).catch((err) => {
      console.error("Failed to touch device in MongoDB:", err);
    });
  }

  return updatedDevice;
}

export function heartbeatDevice(deviceId: string, identityId: string, now = new Date()): Device {
  return touchDevice(deviceId, identityId, now);
}

export async function touchDeviceAsync(deviceId: string, identityId: string, now = new Date()): Promise<Device> {
  const device = getActiveDevice(deviceId, identityId);
  const updatedDevice: Device = { ...device, lastSeenAt: now.toISOString() };
  devices.set(deviceId, updatedDevice);

  if (isDbConnected()) {
    const updated = await deviceRepository.touch(deviceId, identityId, now);
    if (updated) {
      devices.set(updated.deviceId, updated);
      return updated;
    }
  }

  return updatedDevice;
}

export async function rehydrateDeviceStore(): Promise<void> {
  if (isDbConnected()) {
    const all = await mongoose.model("Device").find().lean().exec();
    for (const doc of all as any[]) {
      const name = doc.deviceName || doc.name;
      devices.set(doc.deviceId, {
        deviceId: doc.deviceId,
        identityId: doc.identityId,
        name,
        deviceName: name,
        fingerprint: doc.fingerprint,
        publicKey: doc.publicKey ?? null,
        permissions: [...(doc.permissions ?? [])],
        approvalStatus: doc.approvalStatus ?? "LEGACY",
        approvedAt: doc.approvedAt ? (doc.approvedAt instanceof Date ? doc.approvedAt.toISOString() : String(doc.approvedAt)) : null,
        approvedBy: doc.approvedBy ?? null,
        status: doc.status,
        createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
        lastSeenAt: doc.lastSeenAt instanceof Date ? doc.lastSeenAt.toISOString() : String(doc.lastSeenAt),
        revokedAt: doc.revokedAt ? (doc.revokedAt instanceof Date ? doc.revokedAt.toISOString() : String(doc.revokedAt)) : null,
        replacementOf: doc.replacementOf ?? null,
      });
    }
  }
}

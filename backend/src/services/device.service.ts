import { pendingDeviceCreations } from "../models/device.model.js";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { AppError } from "../middleware/AppError.js";
import { attachDeviceToSession, attachDeviceToSessionAsync } from "./session.service.js";
import { deviceRepository } from "../repositories/device.repository.js";
import { getIdentity, getIdentityByWalletAsync } from "./identity.service.js";

export type DeviceStatus = "ACTIVE" | "REVOKED";
export type DeviceAccessLevel = "TEMPORARY" | "UNRESTRICTED";

export interface Device {
  deviceId: string;
  identityId: string;
  name: string;
  deviceName?: string;
  fingerprint: string;
  status: DeviceStatus;
  accessLevel: DeviceAccessLevel;
  isApproved: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
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
  options?: { accessLevel?: DeviceAccessLevel; isApproved?: boolean },
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

  let isApproved = options?.isApproved ?? (options?.accessLevel === "UNRESTRICTED");
  let accessLevel = options?.accessLevel ?? (isApproved ? "UNRESTRICTED" : undefined);
  if (!accessLevel) {
    let identity: { roles: string[] } | null = null;
    try {
      identity = getIdentity(identityId);
    } catch {
      identity = null;
    }
    const isAdmin = identity && (identity.roles.includes("admin") || identity.roles.includes("administrator"));
    if (isAdmin) {
      isApproved = true;
      accessLevel = "UNRESTRICTED";
    } else {
      isApproved = false;
      accessLevel = "TEMPORARY";
    }
  }

  const timestamp = now.toISOString();
  const device: Device = {
    deviceId: randomUUID(),
    identityId,
    name: normalizedName,
    deviceName: normalizedName,
    fingerprint: normalizedFingerprint,
    status: "ACTIVE",
    accessLevel,
    isApproved,
    approvedAt: isApproved ? timestamp : null,
    approvedBy: isApproved ? "SYSTEM" : null,
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
      status: "ACTIVE",
      accessLevel,
      isApproved,
      approvedAt: isApproved ? now : null,
      approvedBy: isApproved ? "SYSTEM" : null,
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
  options?: { accessLevel?: DeviceAccessLevel; isApproved?: boolean },
): Promise<Device> {
  const normalizedFingerprint = fingerprint.trim();
  const normalizedName = name.trim();
  if (!normalizedName || !normalizedFingerprint) {
    throw new AppError("Device name and fingerprint are required.", 400, "DEVICE_INVALID_INPUT");
  }

  if (isDbConnected()) {
    const existing = await deviceRepository.findActiveByFingerprint(identityId, normalizedFingerprint);
    if (existing) {
      devices.set(existing.deviceId, existing as unknown as Device);
      await attachDeviceToSessionAsync(sessionId, existing.deviceId);
      return existing as unknown as Device;
    }

    let isApproved = options?.isApproved ?? (options?.accessLevel === "UNRESTRICTED");
    let accessLevel = options?.accessLevel ?? (isApproved ? "UNRESTRICTED" : undefined);
    if (!accessLevel) {
      let identity: { roles: string[] } | null = null;
      try {
        identity = getIdentity(identityId);
      } catch {
        identity = null;
      }
      const isAdmin = identity && (identity.roles.includes("admin") || identity.roles.includes("administrator"));
      if (isAdmin) {
        isApproved = true;
        accessLevel = "UNRESTRICTED";
      } else {
        isApproved = false;
        accessLevel = "TEMPORARY";
      }
    }

    const deviceId = randomUUID();
    const created = await deviceRepository.create({
      deviceId,
      identityId,
      name: normalizedName,
      fingerprint: normalizedFingerprint,
      status: "ACTIVE",
      accessLevel,
      isApproved,
      approvedAt: isApproved ? now : null,
      approvedBy: isApproved ? "SYSTEM" : null,
      createdAt: now,
      lastSeenAt: now,
      replacementOf,
    });
    devices.set(created.deviceId, created as unknown as Device);
    await attachDeviceToSessionAsync(sessionId, created.deviceId);
    return created as unknown as Device;
  }

  return enrollDevice(identityId, sessionId, name, fingerprint, now, replacementOf, options);
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

export function listDevicesForIdentity(identityId: string) {
  return [...devices.values()].filter((device) => device.identityId === identityId);
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

  if (isDbConnected()) {
    void deviceRepository.revokeDirect(deviceId, now).catch((err) => {
      console.error("Failed to directly revoke device in MongoDB:", err);
    });
  }

  return device ? { ...device, status: "REVOKED" as const, revokedAt: now.toISOString() } : null;
}

export async function revokeDeviceDirectAsync(deviceId: string, now = new Date()): Promise<Device | null> {
  let device = devices.get(deviceId) ?? null;
  if (isDbConnected()) {
    const updated = await deviceRepository.revokeDirect(deviceId, now);
    if (updated) {
      devices.set(updated.deviceId, updated);
      return updated;
    }
  }

  if (device) {
    const revokedDevice: Device = { ...device, status: "REVOKED" as const, revokedAt: now.toISOString() };
    devices.set(deviceId, revokedDevice);
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

export function approveDevice(deviceId: string, adminIdentityId: string, now = new Date()): Device {
  const device = getDevice(deviceId);
  if (device.status !== "ACTIVE") {
    throw new AppError("Cannot approve a revoked device.", 400, "DEVICE_REVOKED");
  }
  const approvedDevice: Device = {
    ...device,
    accessLevel: "UNRESTRICTED",
    isApproved: true,
    approvedAt: now.toISOString(),
    approvedBy: adminIdentityId,
  };
  devices.set(deviceId, approvedDevice);

  if (isDbConnected()) {
    void deviceRepository.approve(deviceId, adminIdentityId, now).catch((err) => {
      console.error("Failed to approve device in MongoDB:", err);
    });
  }

  return approvedDevice;
}

export async function approveDeviceAsync(deviceId: string, adminIdentityId: string, now = new Date()): Promise<Device> {
  const approved = approveDevice(deviceId, adminIdentityId, now);
  if (isDbConnected()) {
    const doc = await deviceRepository.approve(deviceId, adminIdentityId, now);
    if (doc) {
      devices.set(doc.deviceId, doc as unknown as Device);
      return doc as unknown as Device;
    }
  }
  return approved;
}

export function listPendingDevices(): (Device & { identityDisplayName: string; walletAddress: string })[] {
  return [...devices.values()]
    .filter((device) => device.status === "ACTIVE" && (device.accessLevel === "TEMPORARY" || !device.isApproved))
    .map((device) => {
      let identity: { displayName: string; walletAddress: string } | null = null;
      try {
        identity = getIdentity(device.identityId);
      } catch {
        identity = null;
      }
      return {
        ...device,
        identityDisplayName: identity?.displayName ?? "Unknown Operator",
        walletAddress: identity?.walletAddress ?? "",
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function listPendingDevicesAsync(): Promise<(Device & { identityDisplayName: string; walletAddress: string })[]> {
  if (isDbConnected()) {
    const entities = await deviceRepository.listPending();
    const enriched = await Promise.all(
      entities.map(async (entity) => {
        let identity: { displayName: string; walletAddress: string } | null = null;
        try {
          identity = (await getIdentityByWalletAsync(entity.identityId).catch(() => null)) ?? getIdentity(entity.identityId);
        } catch {
          identity = null;
        }
        return {
          ...(entity as unknown as Device),
          identityDisplayName: identity?.displayName ?? "Unknown Operator",
          walletAddress: identity?.walletAddress ?? "",
        };
      }),
    );
    return enriched;
  }
  return listPendingDevices();
}

export async function rehydrateDeviceStore(): Promise<void> {
  if (isDbConnected()) {
    const all = await mongoose.model("Device").find().lean().exec();
    for (const doc of all as any[]) {
      const name = doc.deviceName || doc.name;
      const isApproved = Boolean(doc.isApproved || doc.accessLevel === "UNRESTRICTED");
      const accessLevel = (doc.accessLevel ?? (isApproved ? "UNRESTRICTED" : "TEMPORARY")) as DeviceAccessLevel;
      devices.set(doc.deviceId, {
        deviceId: doc.deviceId,
        identityId: doc.identityId,
        name,
        deviceName: name,
        fingerprint: doc.fingerprint,
        status: doc.status,
        accessLevel,
        isApproved,
        approvedAt: doc.approvedAt ? (doc.approvedAt instanceof Date ? doc.approvedAt.toISOString() : String(doc.approvedAt)) : null,
        approvedBy: doc.approvedBy ?? null,
        createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
        lastSeenAt: doc.lastSeenAt instanceof Date ? doc.lastSeenAt.toISOString() : String(doc.lastSeenAt),
        revokedAt: doc.revokedAt ? (doc.revokedAt instanceof Date ? doc.revokedAt.toISOString() : String(doc.revokedAt)) : null,
        replacementOf: doc.replacementOf ?? null,
      });
    }
  }
}

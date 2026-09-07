import { randomUUID } from "node:crypto";
import { AppError } from "../middleware/AppError.js";
import { attachDeviceToSession } from "./session.service.js";

export type DeviceStatus = "ACTIVE" | "REVOKED";

export interface Device {
	deviceId: string;
	identityId: string;
	name: string;
	fingerprint: string;
	status: DeviceStatus;
	createdAt: string;
	lastSeenAt: string;
	revokedAt: string | null;
}

const devices = new Map<string, Device>();

export function enrollDevice(identityId: string, sessionId: string, name: string, fingerprint: string, now = new Date()) {
	const normalizedFingerprint = fingerprint.trim();
	if (!name.trim() || !normalizedFingerprint) {
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
		name: name.trim(),
		fingerprint: normalizedFingerprint,
		status: "ACTIVE",
		createdAt: timestamp,
		lastSeenAt: timestamp,
		revokedAt: null,
	};
	devices.set(device.deviceId, device);
	attachDeviceToSession(sessionId, device.deviceId);
	return device;
}

export function getDevice(deviceId: string) {
	const device = devices.get(deviceId);
	if (!device) {
		throw new AppError("Device not found.", 404, "DEVICE_NOT_FOUND");
	}
	return device;
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

export function revokeDevice(deviceId: string, identityId: string, now = new Date()) {
	const device = getActiveDevice(deviceId, identityId);
	const revokedDevice = { ...device, status: "REVOKED" as const, revokedAt: now.toISOString() };
	devices.set(deviceId, revokedDevice);
	return revokedDevice;
}

export function replaceDevice(deviceId: string, identityId: string, sessionId: string, name: string, fingerprint: string) {
	revokeDevice(deviceId, identityId);
	return enrollDevice(identityId, sessionId, name, fingerprint);
}

export function clearDeviceStore() {
	devices.clear();
}

export function touchDevice(deviceId: string, identityId: string, now = new Date()) {
	const device = getActiveDevice(deviceId, identityId);
	const updatedDevice = { ...device, lastSeenAt: now.toISOString() };
	devices.set(deviceId, updatedDevice);
	return updatedDevice;
}
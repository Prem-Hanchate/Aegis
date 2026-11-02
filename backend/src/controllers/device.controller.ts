import type { Request, Response } from "express";
import { AppError } from "../middleware/AppError.js";
import { submitBlockchainWrite } from "../services/blockchain.service.js";
import {
  enrollDevice,
  getDevice,
  getActiveDevice,
  getApprovedDevice,
  heartbeatDevice,
  requestDevicePairing,
  approveDevice,
  updateDevicePermissions,
  listDevicesForIdentityWithFilter,
  listAllDevicesAsync,
  replaceDevice,
  revokeDevice,
  revokeDeviceDirect,
  type DeviceStatus,
} from "../services/device.service.js";
import { bindSessionToDevice } from "../services/session.service.js";
import { requireAuthenticatedRequest } from "../middleware/authentication.js";
import { recordAuditEvent } from "../services/audit/audit.service.js";
import { hasPermission } from "../services/authorization/authorization.service.js";
import { getPermissionsForRoles } from "../services/authorization/authorization.service.js";
import { getIdentity } from "../services/identity.service.js";
import { verifyDeviceProof } from "../services/device-proof.service.js";

export function createDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const { name, fingerprint } = request.body as { name: string; fingerprint: string };
  const device = enrollDevice(auth.identityId, auth.sessionId, name, fingerprint);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: auth.identityId, resource: "devices", action: "enroll", outcome: "SUCCESS", reason: "Device enrolled.", actor: auth.identityId });
  recordAuditEvent({ eventType: "DEVICE_ENROLLED", identityId: auth.identityId, resource: "devices", action: "enroll", outcome: "SUCCESS", reason: "Device enrolled.", actor: auth.identityId });
  return response.status(201).json({ device });
}

export function pairDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const { name, publicKey } = request.body as { name: string; publicKey: string };
  const device = requestDevicePairing(auth.identityId, name, publicKey);
  recordAuditEvent({ eventType: "DEVICE_ENROLLED", identityId: auth.identityId, resource: "devices", action: "pair", outcome: "SUCCESS", reason: "Device pairing requested; administrator approval is pending.", actor: auth.identityId });
  return response.status(201).json({ device });
}

export function approveDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const deviceId = getDeviceId(request);
  const device = approveDevice(deviceId, auth.identityId);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: auth.identityId, resource: "devices", action: "approve", outcome: "SUCCESS", reason: "Device approved.", actor: auth.identityId });
  return response.status(200).json({ device });
}

export function updateDevicePermissionsController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const deviceId = getDeviceId(request);
  const permissions = request.body.permissions as string[];
  const existing = getDevice(deviceId);
  if (existing.identityId !== auth.identityId && !hasPermission(auth.identityId, "policies", "manage")) {
    throw new AppError("Only the device owner or an administrator can change device permissions.", 403, "DEVICE_PERMISSION_DENIED");
  }
  const targetIdentity = getIdentity(existing.identityId);
  const device = updateDevicePermissions(
    deviceId,
    existing.identityId,
    permissions,
    getPermissionsForRoles(targetIdentity.roles),
  );
  recordAuditEvent({
    eventType: "ADMIN_ACTION",
    identityId: auth.identityId,
    deviceId,
    resource: "devices",
    action: "permissions",
    outcome: "SUCCESS",
    reason: "Device permissions updated.",
    actor: auth.identityId,
  });
  return response.status(200).json({ device });
}

export async function listDevicesController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const status = request.query.status;
  const seenSince = request.query.seenSince;
  const parsedStatus = status === "ACTIVE" || status === "REVOKED" ? status as DeviceStatus : undefined;
  const parsedSeenSince = typeof seenSince === "string" ? new Date(seenSince) : undefined;

  if (parsedSeenSince && Number.isNaN(parsedSeenSince.getTime())) {
    return response.status(400).json({
      error: { code: "DEVICE_INVALID_SEEN_SINCE", message: "seenSince must be an ISO date.", details: null },
    });
  }
  if (status !== undefined && !parsedStatus) {
    return response.status(400).json({
      error: { code: "DEVICE_INVALID_STATUS", message: "status must be ACTIVE or REVOKED.", details: null },
    });
  }

  const allDevices = request.query.scope === "all" && hasPermission(auth.identityId, "policies", "manage");
  const devices = allDevices
    ? (await listAllDevicesAsync()).filter((device) =>
        (!parsedStatus || device.status === parsedStatus)
        && (!parsedSeenSince || new Date(device.lastSeenAt) >= parsedSeenSince))
    : listDevicesForIdentityWithFilter(auth.identityId, { status: parsedStatus, seenSince: parsedSeenSince });
  return response.status(200).json({ devices });
}

export async function revokeDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const deviceId = getDeviceId(request);
  const device = getDevice(deviceId);
  const isAdministrator = hasPermission(auth.identityId, "policies", "manage");
  if (device.identityId !== auth.identityId && !isAdministrator) {
    throw new AppError("The device does not belong to the authenticated identity.", 403, "DEVICE_IDENTITY_MISMATCH");
  }
  if (device.status !== "ACTIVE") {
    throw new AppError("The device is revoked.", 403, "DEVICE_REVOKED");
  }
  const transaction = await submitBlockchainWrite((client) => client.revokeDevice(deviceId));
  const revokedDevice = isAdministrator && device.identityId !== auth.identityId
    ? revokeDeviceDirect(deviceId)
    : revokeDevice(deviceId, auth.identityId);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: device.identityId, deviceId, resource: "devices", action: "revoke", outcome: "SUCCESS", reason: "Device revoked.", actor: auth.identityId });
  recordAuditEvent({ eventType: "DEVICE_REVOKED", identityId: device.identityId, deviceId, resource: "devices", action: "revoke", outcome: "SUCCESS", reason: "Device revoked.", actor: auth.identityId });
  return response.status(200).json({ device: revokedDevice, transaction });
}

export async function replaceDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const oldDeviceId = getDeviceId(request);
  const { name, fingerprint } = request.body as { name: string; fingerprint: string };
  // Verify old device exists, is owned by caller, and is active before executing replacement
  getActiveDevice(oldDeviceId, auth.identityId);
  const transaction = await submitBlockchainWrite((client) => client.revokeDevice(oldDeviceId));
  const device = replaceDevice(oldDeviceId, auth.identityId, auth.sessionId, name, fingerprint);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: auth.identityId, resource: "devices", action: "replace", outcome: "SUCCESS", reason: "Device replaced.", actor: auth.identityId });
  recordAuditEvent({ eventType: "DEVICE_REPLACED", identityId: auth.identityId, resource: "devices", action: "replace", outcome: "SUCCESS", reason: "Device replaced.", actor: auth.identityId });
  return response.status(201).json({ device, transaction });
}

export function bindDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const deviceId = getDeviceId(request);
  // Only valid active devices owned by the authenticated identity can be bound to the session
  const device = getApprovedDevice(deviceId, auth.identityId);
  verifyRequestDeviceProof(request, device, auth.sessionId);
  const updatedSession = bindSessionToDevice(auth.sessionId, device.deviceId, auth.identityId);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: auth.identityId, resource: "devices", action: "bind", outcome: "SUCCESS", reason: "Device bound to session.", actor: auth.identityId });
  return response.status(200).json({ session: updatedSession, device });
}

export function heartbeatDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const deviceId = getDeviceId(request);
  const activeDevice = getApprovedDevice(deviceId, auth.identityId);
  verifyRequestDeviceProof(request, activeDevice, auth.sessionId);
  const device = heartbeatDevice(deviceId, auth.identityId);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: auth.identityId, resource: "devices", action: "heartbeat", outcome: "SUCCESS", reason: "Device heartbeat recorded.", actor: auth.identityId });
  return response.status(200).json({ device });
}

function verifyRequestDeviceProof(
  request: Request,
  device: ReturnType<typeof getActiveDevice>,
  sessionId: string,
) {
  if (!device.publicKey) return;
  const timestamp = request.header("x-aegis-device-timestamp");
  const signature = request.header("x-aegis-device-signature");
  if (!timestamp || !signature) {
    throw new AppError("A signed device proof is required.", 403, "DEVICE_PROOF_REQUIRED");
  }
  verifyDeviceProof({
    deviceId: device.deviceId,
    sessionId,
    timestamp,
    method: request.method,
    path: (request.originalUrl || request.path).split("?")[0] ?? "",
    signature,
    publicKey: device.publicKey,
  });
}

function getDeviceId(request: Request) {
  const { deviceId } = request.params;
  if (typeof deviceId !== "string" || deviceId.length === 0) {
    throw new AppError("Device id is required.", 400, "DEVICE_INVALID_ID");
  }
  return deviceId;
}

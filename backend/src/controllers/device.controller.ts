import type { Request, Response } from "express";
import { AppError } from "../middleware/AppError.js";
import { submitBlockchainWrite } from "../services/blockchain.service.js";
import {
  approveDeviceAsync,
  enrollDevice,
  getActiveDevice,
  heartbeatDevice,
  listDevicesForIdentityWithFilter,
  listPendingDevicesAsync,
  replaceDevice,
  revokeDevice,
  type DeviceStatus,
} from "../services/device.service.js";
import { bindSessionToDevice } from "../services/session.service.js";
import { requireAuthenticatedRequest } from "../middleware/authentication.js";
import { recordAuditEvent } from "../services/audit/audit.service.js";

export function createDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const { name, fingerprint } = request.body as { name: string; fingerprint: string };
  const device = enrollDevice(auth.identityId, auth.sessionId, name, fingerprint);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: auth.identityId, resource: "devices", action: "enroll", outcome: "SUCCESS", reason: "Device enrolled.", actor: auth.identityId });
  recordAuditEvent({ eventType: "DEVICE_ENROLLED", identityId: auth.identityId, resource: "devices", action: "enroll", outcome: "SUCCESS", reason: "Device enrolled.", actor: auth.identityId });
  return response.status(201).json({ device });
}

export async function approveDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const deviceId = getDeviceId(request);
  const device = await approveDeviceAsync(deviceId, auth.identityId);
  recordAuditEvent({
    eventType: "ADMIN_ACTION",
    identityId: auth.identityId,
    resource: "devices",
    action: "approve",
    outcome: "SUCCESS",
    reason: `Device ${deviceId} approved for unrestricted access.`,
    actor: auth.identityId,
  });
  recordAuditEvent({
    eventType: "DEVICE_APPROVED",
    identityId: device.identityId,
    deviceId: device.deviceId,
    resource: "devices",
    action: "approve",
    outcome: "SUCCESS",
    reason: "Device approved for unrestricted access.",
    actor: auth.identityId,
  });
  return response.status(200).json({ device });
}

export async function listPendingDevicesController(request: Request, response: Response) {
  requireAuthenticatedRequest(request);
  const devices = await listPendingDevicesAsync();
  return response.status(200).json({ devices });
}

export function listDevicesController(request: Request, response: Response) {
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

  return response.status(200).json({
    devices: listDevicesForIdentityWithFilter(auth.identityId, { status: parsedStatus, seenSince: parsedSeenSince }),
  });
}

export async function revokeDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const deviceId = getDeviceId(request);
  // Verify device exists, is owned by caller, and is active before executing revocation
  getActiveDevice(deviceId, auth.identityId);
  const transaction = await submitBlockchainWrite((client) => client.revokeDevice(deviceId));
  const device = revokeDevice(deviceId, auth.identityId);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: auth.identityId, resource: "devices", action: "revoke", outcome: "SUCCESS", reason: "Device revoked.", actor: auth.identityId });
  recordAuditEvent({ eventType: "DEVICE_REVOKED", identityId: auth.identityId, resource: "devices", action: "revoke", outcome: "SUCCESS", reason: "Device revoked.", actor: auth.identityId });
  return response.status(200).json({ device, transaction });
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
  const device = getActiveDevice(deviceId, auth.identityId);
  const updatedSession = bindSessionToDevice(auth.sessionId, device.deviceId, auth.identityId);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: auth.identityId, resource: "devices", action: "bind", outcome: "SUCCESS", reason: "Device bound to session.", actor: auth.identityId });
  return response.status(200).json({ session: updatedSession, device });
}

export function heartbeatDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const deviceId = getDeviceId(request);
  const device = heartbeatDevice(deviceId, auth.identityId);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: auth.identityId, resource: "devices", action: "heartbeat", outcome: "SUCCESS", reason: "Device heartbeat recorded.", actor: auth.identityId });
  return response.status(200).json({ device });
}

function getDeviceId(request: Request) {
  const { deviceId } = request.params;
  if (typeof deviceId !== "string" || deviceId.length === 0) {
    throw new AppError("Device id is required.", 400, "DEVICE_INVALID_ID");
  }
  return deviceId;
}

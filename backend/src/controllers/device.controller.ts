import type { Request, Response } from "express";
import { requireAuthenticatedRequest } from "../middleware/authentication.js";
import { AppError } from "../middleware/AppError.js";
import {
  enrollDevice,
  getActiveDevice,
  listDevicesForIdentityWithFilter,
  replaceDevice,
  revokeDevice,
  touchDevice,
  type DeviceStatus,
} from "../services/device.service.js";
import { attachDeviceToSession } from "../services/session.service.js";
import { submitBlockchainWrite } from "../services/blockchain.service.js";

export async function createDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const { name, fingerprint } = request.body as { name: string; fingerprint: string };
  const device = await enrollDevice(auth.identityId, auth.sessionId, name, fingerprint);
  return response.status(201).json({ device });
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

  return response.status(200).json({
    devices: await listDevicesForIdentityWithFilter(auth.identityId, { status: parsedStatus, seenSince: parsedSeenSince }),
  });
}

export async function revokeDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const deviceId = getDeviceId(request);
  // Verify device exists, is owned by caller, and is active before executing revocation
  await getActiveDevice(deviceId, auth.identityId);
  const transaction = await submitBlockchainWrite((client) => client.revokeDevice(deviceId));
  return response.status(200).json({ device: await revokeDevice(deviceId, auth.identityId), transaction });
}

export async function replaceDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const oldDeviceId = getDeviceId(request);
  const { name, fingerprint } = request.body as { name: string; fingerprint: string };
  // Verify old device exists, is owned by caller, and is active before executing replacement
  await getActiveDevice(oldDeviceId, auth.identityId);
  const transaction = await submitBlockchainWrite((client) => client.revokeDevice(oldDeviceId));
  const device = await replaceDevice(oldDeviceId, auth.identityId, auth.sessionId, name, fingerprint);
  return response.status(201).json({ device, transaction });
}

export async function bindDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const deviceId = getDeviceId(request);
  // Only valid active devices owned by the authenticated identity can be bound to the session
  const device = await getActiveDevice(deviceId, auth.identityId);
  await attachDeviceToSession(auth.sessionId, device.deviceId);
  return response.status(200).json({ device, message: "Device bound to session successfully." });
}

function getDeviceId(request: Request) {
  const { deviceId } = request.params;
  if (typeof deviceId !== "string" || !deviceId) {
    throw new AppError("Device id is required.", 400, "DEVICE_INVALID_ID");
  }
  return deviceId;
}

export async function heartbeatDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  return response.status(200).json({ device: await touchDevice(getDeviceId(request), auth.identityId) });
}
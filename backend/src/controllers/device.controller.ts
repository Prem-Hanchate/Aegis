import type { Request, Response } from "express";
import { requireAuthenticatedRequest } from "../middleware/authentication.js";
import { AppError } from "../middleware/AppError.js";
import {
  enrollDevice,
  listDevicesForIdentityWithFilter,
  replaceDevice,
  revokeDevice,
  touchDevice,
  type DeviceStatus,
} from "../services/device.service.js";
import { submitBlockchainWrite } from "../services/blockchain.service.js";

export function createDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const { name, fingerprint } = request.body as { name: string; fingerprint: string };
  const device = enrollDevice(auth.identityId, auth.sessionId, name, fingerprint);
  return response.status(201).json({ device });
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
  const transaction = await submitBlockchainWrite((client) => client.revokeDevice(deviceId));
  return response.status(200).json({ device: revokeDevice(deviceId, auth.identityId), transaction });
}

export function replaceDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const { name, fingerprint } = request.body as { name: string; fingerprint: string };
  return response.status(201).json({
    device: replaceDevice(getDeviceId(request), auth.identityId, auth.sessionId, name, fingerprint),
  });
}

function getDeviceId(request: Request) {
  const { deviceId } = request.params;
  if (typeof deviceId !== "string" || !deviceId) {
    throw new AppError("Device id is required.", 400, "DEVICE_INVALID_ID");
  }
  return deviceId;
}

export function heartbeatDeviceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  return response.status(200).json({ device: touchDevice(getDeviceId(request), auth.identityId) });
}
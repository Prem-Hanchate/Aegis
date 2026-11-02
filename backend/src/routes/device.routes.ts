import { Router } from "express";
import { z } from "zod";
import {
  bindDeviceController,
  createDeviceController,
  listDevicesController,
  replaceDeviceController,
  revokeDeviceController,
  heartbeatDeviceController,
  pairDeviceController,
  approveDeviceController,
  updateDevicePermissionsController,
} from "../controllers/device.controller.js";
import { authenticateRequest } from "../middleware/authentication.js";
import { validateBody } from "../middleware/requestValidator.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuthorization } from "../services/authorization/authorization.service.js";

const deviceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  fingerprint: z.string().trim().min(8).max(256),
});
const pairingSchema = z.object({
  name: z.string().trim().min(1).max(100),
  publicKey: z.string().trim().min(32).max(4096),
});
const devicePermissionsSchema = z.object({
  permissions: z.array(z.string().trim().min(3).max(120)).max(100),
});

export const deviceRouter = Router();
deviceRouter.use(authenticateRequest);

deviceRouter.post("/", validateBody(deviceSchema), createDeviceController);
deviceRouter.post("/pair", validateBody(pairingSchema), pairDeviceController);
deviceRouter.patch("/:deviceId/approve", requireAuthorization("policies", "manage"), approveDeviceController);
deviceRouter.patch("/:deviceId/permissions", validateBody(devicePermissionsSchema), updateDevicePermissionsController);
deviceRouter.get("/", asyncHandler(listDevicesController));
deviceRouter.patch("/:deviceId/revoke", asyncHandler(revokeDeviceController));
deviceRouter.post("/:deviceId/replace", validateBody(deviceSchema), asyncHandler(replaceDeviceController));
deviceRouter.post("/:deviceId/heartbeat", heartbeatDeviceController);
deviceRouter.post("/:deviceId/bind", bindDeviceController);
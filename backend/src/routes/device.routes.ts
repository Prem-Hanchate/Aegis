import { Router } from "express";
import { z } from "zod";
import {
  createDeviceController,
  listDevicesController,
  replaceDeviceController,
  revokeDeviceController,
  heartbeatDeviceController,
} from "../controllers/device.controller.js";
import { authenticateRequest } from "../middleware/authentication.js";
import { validateBody } from "../middleware/requestValidator.js";

const deviceSchema = z.object({ name: z.string().trim().min(1).max(100), fingerprint: z.string().trim().min(8).max(256) });

export const deviceRouter = Router();
deviceRouter.use(authenticateRequest);
deviceRouter.post("/", validateBody(deviceSchema), createDeviceController);
deviceRouter.get("/", listDevicesController);
deviceRouter.patch("/:deviceId/revoke", revokeDeviceController);
deviceRouter.post("/:deviceId/replace", validateBody(deviceSchema), replaceDeviceController);
deviceRouter.post("/:deviceId/heartbeat", heartbeatDeviceController);
import { Router } from "express";
import {
  createLoginChallengeController,
  logoutController,
  verifyLoginChallengeController,
  createDeviceLoginChallengeController,
  verifyDeviceLoginController,
  currentSessionController,
  revokeAllSessionsController,
} from "../controllers/auth.controller.js";
import { authenticateRequest } from "../middleware/authentication.js";
import { validateBody } from "../middleware/requestValidator.js";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";

const createChallengeSchema = z.object({
  walletAddress: z.string().min(1),
});

const verifyChallengeSchema = z.object({
  walletAddress: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().min(1),
});
const deviceLoginChallengeSchema = z.object({ deviceId: z.string().uuid() });
const deviceLoginVerifySchema = z.object({
  deviceId: z.string().uuid(),
  nonce: z.string().min(32),
  timestamp: z.string().datetime(),
  signature: z.string().min(32),
});

export const authRouter = Router();

authRouter.post("/challenge", validateBody(createChallengeSchema), createLoginChallengeController);
authRouter.post("/verify", validateBody(verifyChallengeSchema), verifyLoginChallengeController);
authRouter.post("/device/challenge", validateBody(deviceLoginChallengeSchema), asyncHandler(createDeviceLoginChallengeController));
authRouter.post("/device/verify", validateBody(deviceLoginVerifySchema), asyncHandler(verifyDeviceLoginController));
authRouter.post("/logout", logoutController);
authRouter.get("/me", authenticateRequest, currentSessionController);
authRouter.post("/sessions/revoke-all", authenticateRequest, revokeAllSessionsController);
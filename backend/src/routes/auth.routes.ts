import { Router } from "express";
import {
  createLoginChallengeController,
  logoutController,
  verifyLoginChallengeController,
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

export const authRouter = Router();

authRouter.post("/challenge", validateBody(createChallengeSchema), asyncHandler(createLoginChallengeController));
authRouter.post("/verify", validateBody(verifyChallengeSchema), asyncHandler(verifyLoginChallengeController));
authRouter.post("/logout", asyncHandler(logoutController));
authRouter.get("/me", authenticateRequest, asyncHandler(currentSessionController));
authRouter.post("/sessions/revoke-all", authenticateRequest, revokeAllSessionsController);
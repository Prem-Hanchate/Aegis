import { Router } from "express";
import {
  createLoginChallengeController,
  logoutController,
  verifyLoginChallengeController,
} from "../controllers/auth.controller.js";
import { validateBody } from "../middleware/requestValidator.js";
import { z } from "zod";

const createChallengeSchema = z.object({
  walletAddress: z.string().min(1),
});

const verifyChallengeSchema = z.object({
  walletAddress: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().min(1),
});

export const authRouter = Router();

authRouter.post("/challenge", validateBody(createChallengeSchema), createLoginChallengeController);
authRouter.post("/verify", validateBody(verifyChallengeSchema), verifyLoginChallengeController);
authRouter.post("/logout", logoutController);
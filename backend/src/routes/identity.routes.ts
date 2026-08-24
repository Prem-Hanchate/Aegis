import { Router } from "express";
import { z } from "zod";
import {
  createIdentityController,
  getIdentityController,
  listIdentitiesController,
  updateIdentityStatusController,
} from "../controllers/identity.controller.js";
import { validateBody } from "../middleware/requestValidator.js";

const createIdentitySchema = z.object({
  walletAddress: z.string().min(1),
  displayName: z.string().trim().min(1).max(120),
});

const updateIdentityStatusSchema = z.object({
  status: z.enum(["ACTIVE", "REVOKED"]),
});

export const identityRouter = Router();

identityRouter.post("/", validateBody(createIdentitySchema), createIdentityController);
identityRouter.get("/", listIdentitiesController);
identityRouter.get("/:identityId", getIdentityController);
identityRouter.patch(
  "/:identityId/status",
  validateBody(updateIdentityStatusSchema),
  updateIdentityStatusController,
);
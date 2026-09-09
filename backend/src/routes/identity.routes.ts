import { Router } from "express";
import { z } from "zod";
import {
  createIdentityController,
  getIdentityController,
  getIdentityByWalletController,
  listIdentitiesController,
  updateIdentityProfileController,
  updateIdentityStatusController,
  assignIdentityRoleController,
  removeIdentityRoleController,
} from "../controllers/identity.controller.js";
import { validateBody } from "../middleware/requestValidator.js";
import { authenticateRequest } from "../middleware/authentication.js";
import { requireAuthorization } from "../services/authorization/authorization.service.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireBlockchainAdministration } from "../middleware/blockchainAdministration.js";

const createIdentitySchema = z.object({
  walletAddress: z.string().min(1),
  displayName: z.string().trim().min(1).max(120),
});

const updateIdentityStatusSchema = z.object({
  status: z.enum(["ACTIVE", "REVOKED"]),
});
const roleSchema = z.object({ role: z.string().trim().min(1).max(50) });
const profileSchema = z.object({ displayName: z.string().trim().min(1).max(120) });

export const identityRouter = Router();

identityRouter.post("/", requireBlockchainAdministration, validateBody(createIdentitySchema), asyncHandler(createIdentityController));
identityRouter.get("/", listIdentitiesController);
identityRouter.get("/wallet/:walletAddress", getIdentityByWalletController);
identityRouter.get("/:identityId", getIdentityController);
identityRouter.patch("/:identityId/profile", validateBody(profileSchema), updateIdentityProfileController);
identityRouter.patch(
  "/:identityId/status",
  requireBlockchainAdministration,
  validateBody(updateIdentityStatusSchema),
  asyncHandler(updateIdentityStatusController),
);
identityRouter.patch(
  "/:identityId/roles",
  authenticateRequest,
  requireAuthorization("policies", "manage"),
  validateBody(roleSchema),
  asyncHandler(assignIdentityRoleController),
);
identityRouter.delete(
  "/:identityId/roles",
  authenticateRequest,
  requireAuthorization("policies", "manage"),
  validateBody(roleSchema),
  asyncHandler(removeIdentityRoleController),
);
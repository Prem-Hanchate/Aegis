import { Router } from "express";
import { z } from "zod";
import { grantPolicyController, listPoliciesController, revokePolicyController } from "../controllers/policy.controller.js";
import { authenticateRequest } from "../middleware/authentication.js";
import { requireAuthorization } from "../services/authorization/authorization.service.js";
import { validateBody } from "../middleware/requestValidator.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const policySchema = z.object({ role: z.string().trim().min(1), resource: z.string().trim().min(1), action: z.string().trim().min(1) });
const revokeSchema = z.object({ resource: z.string().trim().min(1), action: z.string().trim().min(1) });

export const policyRouter = Router();
policyRouter.use(authenticateRequest, requireAuthorization("policies", "manage"));
policyRouter.get("/", listPoliciesController);
policyRouter.post("/permissions", validateBody(policySchema), asyncHandler(grantPolicyController));
policyRouter.delete("/:role/permissions", validateBody(revokeSchema), asyncHandler(revokePolicyController));
import { Router } from "express";
import { listAuditController, summarizeAuditController } from "../controllers/audit.controller.js";
import { authenticateRequest } from "../middleware/authentication.js";
import { requireAuthorization } from "../services/authorization/authorization.service.js";

export const auditRouter = Router();
auditRouter.use(authenticateRequest, requireAuthorization("policies", "manage"));
auditRouter.get("/summary", summarizeAuditController);
auditRouter.get("/", listAuditController);
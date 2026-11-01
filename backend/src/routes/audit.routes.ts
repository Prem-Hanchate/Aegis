import { Router } from "express";
import {
  anchorAuditBatchController,
  getAuditProofController,
  listAuditBatchesController,
  listAuditController,
  summarizeAuditController,
  verifyAuditBatchController,
  verifyAuditRecordController,
} from "../controllers/audit.controller.js";
import { authenticateRequest } from "../middleware/authentication.js";
import { requireAuthorization } from "../services/authorization/authorization.service.js";

export const auditRouter = Router();
auditRouter.use(authenticateRequest, requireAuthorization("policies", "manage"));

auditRouter.get("/summary", summarizeAuditController);
auditRouter.post("/anchor", anchorAuditBatchController);
auditRouter.get("/batches", listAuditBatchesController);
auditRouter.get("/batches/:batchId/verify", verifyAuditBatchController);
auditRouter.get("/:eventId/proof", getAuditProofController);
auditRouter.get("/:eventId/verify", verifyAuditRecordController);
auditRouter.get("/", listAuditController);

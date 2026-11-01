import type { Request, Response } from "express";
import { listAuditEvents, summarizeAuditEvents } from "../services/audit/audit.service.js";
import {
  batchAndAnchorAuditLogs,
  detectTamperedBatchRecords,
  getAuditProofForEvent,
  listAuditBatches,
  verifyAuditRecordIntegrity,
} from "../services/audit/anchoring.service.js";
import { z } from "zod";
import { AppError } from "../middleware/AppError.js";

const auditQuerySchema = z.object({
  identityId: z.string().trim().min(1).max(128).optional(),
  eventType: z.string().trim().min(1).max(64).optional(),
  outcome: z.enum(["ALLOWED", "DENIED", "SUCCESS", "FAILURE"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function getRouteParam(value: string | string[] | undefined, name: string): string {
  if (typeof value !== "string" || !value) {
    throw new AppError(`${name} is required.`, 400, "AUDIT_INVALID_ROUTE_PARAM");
  }
  return value;
}

export function listAuditController(request: Request, response: Response) {
  const parsed = auditQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    throw new AppError("Request validation failed.", 400, "VALIDATION_ERROR", parsed.error.flatten());
  }
  const query = parsed.data;
  return response.status(200).json(listAuditEvents(query));
}

export function summarizeAuditController(_request: Request, response: Response) {
  return response.status(200).json({ summary: summarizeAuditEvents() });
}

export async function anchorAuditBatchController(request: Request, response: Response) {
  const limit = typeof request.body?.limit === "number" ? request.body.limit : 50;
  const batch = await batchAndAnchorAuditLogs(limit);
  return response.status(201).json({ batch });
}

export async function listAuditBatchesController(request: Request, response: Response) {
  const limit = typeof request.query?.limit === "string" ? Number(request.query.limit) : 20;
  const batches = await listAuditBatches(limit);
  return response.status(200).json({ batches });
}

export async function getAuditProofController(request: Request, response: Response) {
  const eventId = getRouteParam(request.params.eventId, "eventId");
  const proof = await getAuditProofForEvent(eventId);
  return response.status(200).json({ proof });
}

export async function verifyAuditRecordController(request: Request, response: Response) {
  const eventId = getRouteParam(request.params.eventId, "eventId");
  const result = await verifyAuditRecordIntegrity(eventId);
  return response.status(200).json({ verification: result });
}

export async function verifyAuditBatchController(request: Request, response: Response) {
  const batchIdParam = getRouteParam(request.params.batchId, "batchId");
  const batchId = Number(batchIdParam);
  if (isNaN(batchId) || batchId <= 0) {
    throw new AppError("Valid batchId is required.", 400, "AUDIT_INVALID_BATCH_ID");
  }
  const result = await detectTamperedBatchRecords(batchId);
  return response.status(200).json({ verification: result });
}

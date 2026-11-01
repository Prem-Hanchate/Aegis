import type { Request, Response } from "express";
import { listAuditEvents, summarizeAuditEvents } from "../services/audit/audit.service.js";
import { z } from "zod";
import { AppError } from "../middleware/AppError.js";

const auditQuerySchema = z.object({
  identityId: z.string().trim().min(1).max(128).optional(),
  eventType: z.string().trim().min(1).max(64).optional(),
  outcome: z.enum(["ALLOWED", "DENIED", "SUCCESS", "FAILURE"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

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
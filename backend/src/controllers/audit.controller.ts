import type { Request, Response } from "express";
import { listAuditEvents, summarizeAuditEvents } from "../services/audit/audit.service.js";
import { z } from "zod";

const auditQuerySchema = z.object({
  identityId: z.string().optional(),
  eventType: z.string().optional(),
  outcome: z.enum(["ALLOWED", "DENIED", "SUCCESS", "FAILURE"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export function listAuditController(request: Request, response: Response) {
  const query = auditQuerySchema.parse(request.query);
  return response.status(200).json(listAuditEvents(query));
}

export function summarizeAuditController(_request: Request, response: Response) {
  return response.status(200).json({ summary: summarizeAuditEvents() });
}
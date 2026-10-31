import { randomUUID } from "node:crypto";
import { AppError } from "../../middleware/AppError.js";
import { auditRepository } from "../../repositories/index.js";

export type AuditOutcome = "ALLOWED" | "DENIED" | "SUCCESS" | "FAILURE";
export interface AuditEvent { eventId: string; timestamp: string; eventType: string; identityId: string | null; resource: string | null; action: string | null; outcome: AuditOutcome; reason: string | null; actor: string | null; }
export interface AuditQuery { identityId?: string; eventType?: string; outcome?: AuditOutcome; limit?: number; offset?: number; }

export async function recordAuditEvent(event: Omit<AuditEvent, "eventId" | "timestamp">, now = new Date()) {
  return auditRepository.create({ eventId: randomUUID(), timestamp: now.toISOString(), ...event });
}
export async function listAuditEvents(query: AuditQuery = {}) { return auditRepository.list(query); }
export async function clearAuditEvents() {
  if (process.env.NODE_ENV !== "test") throw new AppError("Audit clearing is only available in tests.", 403, "TEST_ONLY_OPERATION");
  await auditRepository.clear();
}
export async function summarizeAuditEvents() {
  return auditRepository.summarize();
}

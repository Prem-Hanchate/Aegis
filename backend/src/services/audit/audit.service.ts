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
<<<<<<< HEAD
=======

export function listAuditEvents(query: AuditQuery = {}) {
  const filtered = auditEvents.filter((event) => {
    return (!query.identityId || event.identityId === query.identityId)
      && (!query.eventType || event.eventType === query.eventType)
      && (!query.outcome || event.outcome === query.outcome);
  });
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(100, Math.max(1, query.limit ?? 100));
  return {
    total: filtered.length,
    events: filtered.slice(offset, offset + limit),
  };
}

export function clearAuditEvents() {
  auditEvents.length = 0;
}

export function summarizeAuditEvents() {
  return auditEvents.reduce(
    (summary, event) => {
      summary.total += 1;
      summary.byOutcome[event.outcome] = (summary.byOutcome[event.outcome] ?? 0) + 1;
      summary.byEventType[event.eventType] = (summary.byEventType[event.eventType] ?? 0) + 1;
      return summary;
    },
    {
      total: 0,
      byOutcome: {} as Record<string, number>,
      byEventType: {} as Record<string, number>,
    },
  );
}
>>>>>>> cc5c93babec97a051ca26374f63bc525ef9c3b8a

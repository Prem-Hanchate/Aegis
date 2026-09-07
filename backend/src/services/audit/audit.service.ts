import { randomUUID } from "node:crypto";

export type AuditOutcome = "ALLOWED" | "DENIED" | "SUCCESS" | "FAILURE";

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  eventType: string;
  identityId: string | null;
  resource: string | null;
  action: string | null;
  outcome: AuditOutcome;
  reason: string | null;
  actor: string | null;
}

const auditEvents: AuditEvent[] = [];

export function recordAuditEvent(event: Omit<AuditEvent, "eventId" | "timestamp">, now = new Date()) {
  const auditEvent: AuditEvent = {
    eventId: randomUUID(),
    timestamp: now.toISOString(),
    ...event,
  };
  auditEvents.push(auditEvent);
  return auditEvent;
}

export interface AuditQuery {
  identityId?: string;
  eventType?: string;
  outcome?: AuditOutcome;
  limit?: number;
  offset?: number;
}

export function listAuditEvents(query: AuditQuery = {}) {
  const filtered = auditEvents.filter((event) => {
    return (!query.identityId || event.identityId === query.identityId)
      && (!query.eventType || event.eventType === query.eventType)
      && (!query.outcome || event.outcome === query.outcome);
  });
  const offset = query.offset ?? 0;
  const limit = query.limit ?? 100;
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
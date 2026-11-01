import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { auditLogRepository } from "../../repositories/audit-log.repository.js";

export type AuditOutcome = "ALLOWED" | "DENIED" | "SUCCESS" | "FAILURE";

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  eventType: string;
  identityId: string | null;
  deviceId?: string | null;
  resource: string | null;
  action: string | null;
  outcome: AuditOutcome;
  reason: string | null;
  actor: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const auditEvents: AuditEvent[] = [];

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function recordAuditEvent(event: Omit<AuditEvent, "eventId" | "timestamp">, now = new Date()): AuditEvent {
  const auditEvent: AuditEvent = {
    eventId: randomUUID(),
    timestamp: now.toISOString(),
    deviceId: null,
    requestId: null,
    ipAddress: null,
    userAgent: null,
    ...event,
  };
  auditEvents.push(auditEvent);

  if (isDbConnected()) {
    void auditLogRepository.create({
      eventId: auditEvent.eventId,
      timestamp: now,
      eventType: auditEvent.eventType,
      identityId: auditEvent.identityId,
      deviceId: auditEvent.deviceId,
      resource: auditEvent.resource,
      action: auditEvent.action,
      outcome: auditEvent.outcome,
      reason: auditEvent.reason,
      actor: auditEvent.actor,
      requestId: auditEvent.requestId,
      ipAddress: auditEvent.ipAddress,
      userAgent: auditEvent.userAgent,
    }).catch((err) => {
      console.error("Failed to persist audit event to MongoDB:", err);
    });
  }

  return auditEvent;
}

export async function recordAuditEventAsync(event: Omit<AuditEvent, "eventId" | "timestamp">, now = new Date()): Promise<AuditEvent> {
  const auditEvent: AuditEvent = {
    eventId: randomUUID(),
    timestamp: now.toISOString(),
    deviceId: null,
    requestId: null,
    ipAddress: null,
    userAgent: null,
    ...event,
  };
  auditEvents.push(auditEvent);

  if (isDbConnected()) {
    const saved = await auditLogRepository.create({
      eventId: auditEvent.eventId,
      timestamp: now,
      eventType: auditEvent.eventType,
      identityId: auditEvent.identityId,
      deviceId: auditEvent.deviceId,
      resource: auditEvent.resource,
      action: auditEvent.action,
      outcome: auditEvent.outcome,
      reason: auditEvent.reason,
      actor: auditEvent.actor,
      requestId: auditEvent.requestId,
      ipAddress: auditEvent.ipAddress,
      userAgent: auditEvent.userAgent,
    });
    return saved;
  }

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

export async function listAuditEventsAsync(query: AuditQuery = {}) {
  if (isDbConnected()) {
    return await auditLogRepository.list(query);
  }
  return listAuditEvents(query);
}

export function resetAuditMemoryStore() {
  auditEvents.length = 0;
}

export function clearAuditEvents() {
  auditEvents.length = 0;
  if (isDbConnected()) {
    void auditLogRepository.clear().catch((err) => {
      console.error("Failed to clear audit events in MongoDB:", err);
    });
  }
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

export async function summarizeAuditEventsAsync() {
  if (isDbConnected()) {
    return await auditLogRepository.summarize();
  }
  return summarizeAuditEvents();
}

export async function rehydrateAuditStore(): Promise<void> {
  if (isDbConnected()) {
    const res = await auditLogRepository.list({ limit: 500 });
    auditEvents.length = 0;
    for (const event of res.events) {
      auditEvents.push(event);
    }
  }
}

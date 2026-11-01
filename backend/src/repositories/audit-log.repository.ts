import { AuditLogModel } from "../models/audit-log.model.js";

export interface AuditLogEntity {
  eventId: string;
  timestamp: string;
  eventType: string;
  identityId: string | null;
  deviceId: string | null;
  resource: string | null;
  action: string | null;
  outcome: "ALLOWED" | "DENIED" | "SUCCESS" | "FAILURE";
  reason: string | null;
  actor: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditLogQuery {
  identityId?: string;
  eventType?: string;
  outcome?: "ALLOWED" | "DENIED" | "SUCCESS" | "FAILURE";
  limit?: number;
  offset?: number;
}

function toEntity(doc: any): AuditLogEntity {
  return {
    eventId: doc.eventId,
    timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : String(doc.timestamp),
    eventType: doc.eventType,
    identityId: doc.identityId ?? null,
    deviceId: doc.deviceId ?? null,
    resource: doc.resource ?? null,
    action: doc.action ?? null,
    outcome: doc.outcome,
    reason: doc.reason ?? null,
    actor: doc.actor ?? null,
    requestId: doc.requestId ?? null,
    ipAddress: doc.ipAddress ?? null,
    userAgent: doc.userAgent ?? null,
  };
}

export class AuditLogRepository {
  async create(data: {
    eventId: string;
    timestamp?: Date;
    eventType: string;
    identityId?: string | null;
    deviceId?: string | null;
    resource?: string | null;
    action?: string | null;
    outcome: "ALLOWED" | "DENIED" | "SUCCESS" | "FAILURE";
    reason?: string | null;
    actor?: string | null;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<AuditLogEntity> {
    const doc = await AuditLogModel.create({
      eventId: data.eventId,
      timestamp: data.timestamp ?? new Date(),
      eventType: data.eventType,
      identityId: data.identityId ?? null,
      deviceId: data.deviceId ?? null,
      resource: data.resource ?? null,
      action: data.action ?? null,
      outcome: data.outcome,
      reason: data.reason ?? null,
      actor: data.actor ?? null,
      requestId: data.requestId ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
    });
    return toEntity(doc);
  }

  async list(query: AuditLogQuery = {}): Promise<{ total: number; events: AuditLogEntity[] }> {
    const filter: Record<string, any> = {};
    if (query.identityId) filter.identityId = query.identityId;
    if (query.eventType) filter.eventType = query.eventType;
    if (query.outcome) filter.outcome = query.outcome;

    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const [total, docs] = await Promise.all([
      AuditLogModel.countDocuments(filter).exec(),
      AuditLogModel.find(filter).sort({ timestamp: -1 }).skip(offset).limit(limit).lean().exec(),
    ]);

    return {
      total,
      events: docs.map(toEntity),
    };
  }

  async summarize(): Promise<{
    total: number;
    byOutcome: Record<string, number>;
    byEventType: Record<string, number>;
  }> {
    const [outcomeAgg, typeAgg, total] = await Promise.all([
      AuditLogModel.aggregate([{ $group: { _id: "$outcome", count: { $sum: 1 } } }]).exec(),
      AuditLogModel.aggregate([{ $group: { _id: "$eventType", count: { $sum: 1 } } }]).exec(),
      AuditLogModel.countDocuments().exec(),
    ]);

    const byOutcome: Record<string, number> = {};
    for (const item of outcomeAgg) {
      if (item._id) byOutcome[item._id] = item.count;
    }

    const byEventType: Record<string, number> = {};
    for (const item of typeAgg) {
      if (item._id) byEventType[item._id] = item.count;
    }

    return {
      total,
      byOutcome,
      byEventType,
    };
  }

  async clear(): Promise<void> {
    await AuditLogModel.deleteMany({}).exec();
  }
}

export const auditLogRepository = new AuditLogRepository();


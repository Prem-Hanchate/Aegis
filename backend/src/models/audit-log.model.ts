import mongoose, { model, Schema, type InferSchemaType, type Model } from "mongoose";

export const auditLogSchema = new Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    identityId: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },
    deviceId: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },
    resource: {
      type: String,
      default: null,
      trim: true,
    },
    action: {
      type: String,
      default: null,
      trim: true,
    },
    outcome: {
      type: String,
      enum: ["ALLOWED", "DENIED", "SUCCESS", "FAILURE"],
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: null,
      trim: true,
    },
    actor: {
      type: String,
      default: null,
      trim: true,
    },
    requestId: {
      type: String,
      default: null,
      trim: true,
    },
    ipAddress: {
      type: String,
      default: null,
      trim: true,
    },
    userAgent: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    collection: "audit_logs",
  },
);

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ eventType: 1, outcome: 1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema> & { _id: unknown };
export const AuditLogModel: Model<AuditLogDocument> =
  (mongoose.models?.AuditLog as Model<AuditLogDocument>) || model<AuditLogDocument>("AuditLog", auditLogSchema);


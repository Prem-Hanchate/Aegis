import mongoose, { model, Schema, type InferSchemaType, type Model } from "mongoose";

export const auditBatchSchema = new Schema(
  {
    batchId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    rootHash: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    batchSize: {
      type: Number,
      required: true,
    },
    eventIds: {
      type: [String],
      required: true,
      default: [],
    },
    startTimestamp: {
      type: Date,
      required: true,
    },
    endTimestamp: {
      type: Date,
      required: true,
    },
    metadata: {
      type: String,
      default: "",
    },
    txHash: {
      type: String,
      default: null,
      trim: true,
    },
    blockNumber: {
      type: Number,
      default: null,
    },
    anchoredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ["ANCHORED", "FAILED", "PENDING"],
      default: "ANCHORED",
      index: true,
    },
  },
  {
    collection: "audit_batches",
    timestamps: true,
  },
);

export type AuditBatchDocument = InferSchemaType<typeof auditBatchSchema> & { _id: unknown };
export const AuditBatchModel: Model<AuditBatchDocument> =
  (mongoose.models?.AuditBatch as Model<AuditBatchDocument>) ||
  model<AuditBatchDocument>("AuditBatch", auditBatchSchema);


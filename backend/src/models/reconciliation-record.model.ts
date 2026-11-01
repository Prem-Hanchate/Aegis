import mongoose, { model, Schema, type InferSchemaType, type Model } from "mongoose";

export const discrepancySchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["IDENTITY_STATUS", "ROLE_ASSIGNMENT", "PERMISSION_GRANT", "DEVICE_REVOCATION", "PERMISSION_REVOCATION"],
    },
    identifier: { type: String, required: true },
    blockchainValue: { type: Schema.Types.Mixed },
    cachedValue: { type: Schema.Types.Mixed },
    actionTaken: { type: String, required: true },
  },
  { _id: false },
);

export const reconciliationRecordSchema = new Schema(
  {
    reconciliationId: {
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
    chainId: {
      type: Number,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "DIFFERENCES_FOUND", "FAILED"],
      required: true,
      index: true,
    },
    discrepanciesCount: {
      type: Number,
      default: 0,
    },
    discrepancies: {
      type: [discrepancySchema],
      default: [],
    },
    restoredRecordsCount: {
      type: Number,
      default: 0,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    collection: "blockchain_reconciliations",
  },
);

reconciliationRecordSchema.index({ timestamp: -1 });

export type ReconciliationRecordDocument = InferSchemaType<typeof reconciliationRecordSchema> & { _id: unknown };
export const ReconciliationRecordModel: Model<ReconciliationRecordDocument> =
  (mongoose.models?.ReconciliationRecord as Model<ReconciliationRecordDocument>) ||
  model<ReconciliationRecordDocument>("ReconciliationRecord", reconciliationRecordSchema);


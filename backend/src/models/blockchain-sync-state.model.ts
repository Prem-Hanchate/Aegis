import mongoose, { model, Schema, type InferSchemaType, type Model } from "mongoose";

export const failedEventSchema = new Schema(
  {
    eventName: { type: String, required: true },
    blockNumber: { type: Number, required: true },
    txHash: { type: String, required: true },
    logIndex: { type: Number, required: true },
    error: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

export const blockchainSyncStateSchema = new Schema(
  {
    contractAddress: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    contractName: {
      type: String,
      required: true,
      trim: true,
    },
    chainId: {
      type: Number,
      required: true,
      index: true,
    },
    lastProcessedBlock: {
      type: Number,
      default: 0,
      index: true,
    },
    lastProcessedBlockHash: {
      type: String,
      default: "",
    },
    lastProcessedEvent: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["IDLE", "SYNCING", "ERROR", "RECONCILING"],
      default: "IDLE",
      index: true,
    },
    lastSyncTimestamp: {
      type: Date,
      default: Date.now,
    },
    lastError: {
      type: String,
      default: null,
    },
    failedEvents: {
      type: [failedEventSchema],
      default: [],
    },
    pendingReconciliation: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "blockchain_sync_states",
  },
);

blockchainSyncStateSchema.index({ chainId: 1, contractAddress: 1 }, { unique: true });

export type BlockchainSyncStateDocument = InferSchemaType<typeof blockchainSyncStateSchema> & { _id: unknown };
export const BlockchainSyncStateModel: Model<BlockchainSyncStateDocument> =
  (mongoose.models?.BlockchainSyncState as Model<BlockchainSyncStateDocument>) ||
  model<BlockchainSyncStateDocument>("BlockchainSyncState", blockchainSyncStateSchema);


import mongoose, { model, Schema, type InferSchemaType, type Model } from "mongoose";

export const blockchainEventSchema = new Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    chainId: {
      type: Number,
      required: true,
      index: true,
    },
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
    eventName: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    blockNumber: {
      type: Number,
      required: true,
      index: true,
    },
    blockHash: {
      type: String,
      required: true,
      trim: true,
    },
    txHash: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    logIndex: {
      type: Number,
      required: true,
    },
    parameters: {
      type: Schema.Types.Mixed,
      required: true,
    },
    confirmed: {
      type: Boolean,
      default: false,
      index: true,
    },
    confirmations: {
      type: Number,
      default: 1,
    },
    processedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: "blockchain_events",
  },
);

blockchainEventSchema.index({ chainId: 1, blockNumber: 1, logIndex: 1 });
blockchainEventSchema.index({ chainId: 1, txHash: 1, logIndex: 1 }, { unique: true });

export type BlockchainEventDocument = InferSchemaType<typeof blockchainEventSchema> & { _id: unknown };
export const BlockchainEventModel: Model<BlockchainEventDocument> =
  (mongoose.models?.BlockchainEvent as Model<BlockchainEventDocument>) ||
  model<BlockchainEventDocument>("BlockchainEvent", blockchainEventSchema);


import mongoose, { model, Schema, type InferSchemaType, type Model } from "mongoose";

export const challengeSchema = new Schema(
  {
    nonce: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    walletAddress: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    domain: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      required: true,
      default: "authentication",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "challenges",
  },
);

// TTL index to automatically purge expired nonces
challengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ChallengeDocument = InferSchemaType<typeof challengeSchema> & { _id: unknown };
export const ChallengeModel: Model<ChallengeDocument> =
  (mongoose.models?.Challenge as Model<ChallengeDocument>) || model<ChallengeDocument>("Challenge", challengeSchema);

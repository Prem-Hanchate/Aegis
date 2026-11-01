import mongoose, { model, Schema, type InferSchemaType, type Model } from "mongoose";

export const sessionSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    identityId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    deviceId: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED"],
      default: "ACTIVE",
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "sessions",
  },
);

// TTL index to automatically purge expired sessions from MongoDB
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDocument = InferSchemaType<typeof sessionSchema> & { _id: unknown };
export const SessionModel: Model<SessionDocument> =
  (mongoose.models?.Session as Model<SessionDocument>) || model<SessionDocument>("Session", sessionSchema);

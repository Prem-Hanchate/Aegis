import mongoose, { model, Schema, type InferSchemaType, type Model } from "mongoose";

export const identitySchema = new Schema(
  {
    identityId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    walletAddress: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED"],
      default: "ACTIVE",
      index: true,
    },
    roles: {
      type: [String],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "identities",
  },
);

export type IdentityDocument = InferSchemaType<typeof identitySchema> & { _id: unknown };
export const IdentityModel: Model<IdentityDocument> =
  (mongoose.models?.Identity as Model<IdentityDocument>) || model<IdentityDocument>("Identity", identitySchema);

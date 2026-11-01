import mongoose, { model, Schema, type InferSchemaType, type Model } from "mongoose";

export const policySchema = new Schema(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    assignedIdentities: {
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
    collection: "policies",
  },
);

export type PolicyDocument = InferSchemaType<typeof policySchema> & { _id: unknown };
export const PolicyModel: Model<PolicyDocument> =
  (mongoose.models?.Policy as Model<PolicyDocument>) || model<PolicyDocument>("Policy", policySchema);


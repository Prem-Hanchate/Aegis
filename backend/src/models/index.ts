import { model, Schema, type InferSchemaType } from "mongoose";

const identitySchema = new Schema(
	{
		walletAddress: { type: String, required: true, unique: true, index: true },
		displayName: { type: String, required: true, trim: true },
		status: { type: String, enum: ["ACTIVE", "REVOKED"], default: "ACTIVE" },
		roles: { type: [String], default: [] },
	},
	{ timestamps: true },
);

export type IdentityDocument = InferSchemaType<typeof identitySchema> & { _id: string };
export const IdentityModel = model("Identity", identitySchema);

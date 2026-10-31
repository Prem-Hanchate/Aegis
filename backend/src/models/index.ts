import { model, Schema, type InferSchemaType } from "mongoose";

const id = { type: String, required: true };
const date = { type: Date, required: true };

export const identitySchema = new Schema({
	identityId: { ...id, unique: true, index: true },
	walletAddress: { ...id, unique: true, index: true },
	displayName: { ...id, trim: true },
	status: { type: String, enum: ["ACTIVE", "REVOKED"], required: true, default: "ACTIVE", index: true },
	roles: { type: [String], required: true, default: [] },
	createdAt: date,
	updatedAt: date,
}, { versionKey: false });

export const challengeSchema = new Schema({
	nonce: { ...id, unique: true, index: true },
	walletAddress: { ...id, index: true },
	domain: id,
	message: id,
	issuedAt: date,
	expiresAt: { ...date, index: true, expires: 0 },
	purpose: id,
	used: { type: Boolean, required: true, default: false, index: true },
	usedAt: { type: Date, default: null },
}, { versionKey: false });

export const sessionSchema = new Schema({
	sessionId: { ...id, unique: true, index: true },
	identityId: { ...id, index: true },
	deviceId: { type: String, default: null, index: true },
	tokenHash: { ...id, unique: true, index: true, select: false },
	createdAt: date,
	expiresAt: { ...date, index: true, expires: 0 },
	status: { type: String, enum: ["ACTIVE", "REVOKED"], required: true, default: "ACTIVE", index: true },
	revokedAt: { type: Date, default: null },
}, { versionKey: false });

export const deviceSchema = new Schema({
	deviceId: { ...id, unique: true, index: true },
	identityId: { ...id, index: true },
	name: id,
	fingerprint: { ...id, index: true },
	status: { type: String, enum: ["ACTIVE", "REVOKED"], required: true, default: "ACTIVE", index: true },
	createdAt: date,
	lastSeenAt: { ...date, index: true },
	revokedAt: { type: Date, default: null },
}, { versionKey: false });
deviceSchema.index(
	{ identityId: 1, fingerprint: 1 },
	{ unique: true, partialFilterExpression: { status: "ACTIVE" } },
);

export const policySchema = new Schema({
	role: { ...id, index: true },
	resource: id,
	action: id,
	permission: { ...id, index: true },
	createdAt: date,
	updatedAt: date,
}, { versionKey: false });
policySchema.index({ role: 1, permission: 1 }, { unique: true });

export const auditEventSchema = new Schema({
	eventId: { ...id, unique: true, index: true },
	timestamp: { ...date, index: true },
	eventType: { ...id, index: true },
	identityId: { type: String, default: null, index: true },
	resource: { type: String, default: null },
	action: { type: String, default: null },
	outcome: { type: String, enum: ["ALLOWED", "DENIED", "SUCCESS", "FAILURE"], required: true, index: true },
	reason: { type: String, default: null },
	actor: { type: String, default: null },
}, { versionKey: false });
auditEventSchema.index({ timestamp: -1 });
auditEventSchema.index({ timestamp: -1, eventId: -1 });
auditEventSchema.index({ identityId: 1, timestamp: -1 });

export type IdentityDocument = InferSchemaType<typeof identitySchema>;
export type ChallengeDocument = InferSchemaType<typeof challengeSchema>;
export type SessionDocument = InferSchemaType<typeof sessionSchema>;
export type DeviceDocument = InferSchemaType<typeof deviceSchema>;
export type PolicyDocument = InferSchemaType<typeof policySchema>;
export type AuditEventDocument = InferSchemaType<typeof auditEventSchema>;

export const IdentityModel = model("Identity", identitySchema);
export const ChallengeModel = model("Challenge", challengeSchema);
export const SessionModel = model("Session", sessionSchema);
export const DeviceModel = model("Device", deviceSchema);
export const PolicyModel = model("Policy", policySchema);
export const AuditEventModel = model("AuditEvent", auditEventSchema);

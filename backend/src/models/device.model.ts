export const pendingDeviceCreations = new Map<string, Promise<any>>();
import mongoose, { model, Schema, type InferSchemaType, type Model } from "mongoose";

export const deviceSchema = new Schema(
  {
    deviceId: {
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
    fingerprint: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
      alias: "name",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REVOKED"],
      default: "ACTIVE",
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacementOf: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    collection: "devices",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

deviceSchema.index({ identityId: 1, fingerprint: 1, status: 1 });
deviceSchema.index({ identityId: 1, status: 1 });

export type DeviceDocument = InferSchemaType<typeof deviceSchema> & { _id: unknown; name?: string };
deviceSchema.pre('updateOne', async function() {
  const filter = this.getFilter();
  if (filter && filter.deviceId && pendingDeviceCreations.has(filter.deviceId)) {
    await pendingDeviceCreations.get(filter.deviceId);
  }
});

deviceSchema.pre('findOne', async function() {
  const filter = this.getFilter();
  if (filter && filter.deviceId && pendingDeviceCreations.has(filter.deviceId)) {
    await pendingDeviceCreations.get(filter.deviceId);
  }
});

export const DeviceModel: Model<DeviceDocument> =
  (mongoose.models?.Device as Model<DeviceDocument>) || model<DeviceDocument>("Device", deviceSchema);


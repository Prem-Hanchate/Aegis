import { IdentityModel, type IdentityDocument } from "../models/identity.model.js";

export interface IdentityEntity {
  identityId: string;
  walletAddress: string;
  displayName: string;
  status: "ACTIVE" | "REVOKED";
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

function toEntity(doc: any): IdentityEntity {
  return {
    identityId: doc.identityId,
    walletAddress: doc.walletAddress,
    displayName: doc.displayName,
    status: doc.status,
    roles: [...(doc.roles ?? [])],
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
  };
}

export class IdentityRepository {
  async create(data: {
    identityId: string;
    walletAddress: string;
    displayName: string;
    status?: "ACTIVE" | "REVOKED";
    roles?: string[];
  }): Promise<IdentityEntity> {
    const doc = await IdentityModel.create({
      identityId: data.identityId,
      walletAddress: data.walletAddress,
      displayName: data.displayName,
      status: data.status ?? "ACTIVE",
      roles: data.roles ?? [],
    });
    return toEntity(doc);
  }

  async findById(identityId: string): Promise<IdentityEntity | null> {
    const doc = await IdentityModel.findOne({ identityId }).lean().exec();
    return doc ? toEntity(doc) : null;
  }

  async findByWallet(walletAddress: string): Promise<IdentityEntity | null> {
    const doc = await IdentityModel.findOne({
      walletAddress: { $regex: new RegExp(`^${walletAddress}$`, "i") },
    })
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async list(): Promise<IdentityEntity[]> {
    const docs = await IdentityModel.find().lean().exec();
    return docs.map(toEntity);
  }

  async updateProfile(identityId: string, displayName: string): Promise<IdentityEntity | null> {
    const doc = await IdentityModel.findOneAndUpdate(
      { identityId },
      { $set: { displayName: displayName.trim(), updatedAt: new Date() } },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async updateStatus(identityId: string, status: "ACTIVE" | "REVOKED"): Promise<IdentityEntity | null> {
    const doc = await IdentityModel.findOneAndUpdate(
      { identityId },
      { $set: { status, updatedAt: new Date() } },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async addRole(identityId: string, role: string): Promise<IdentityEntity | null> {
    const doc = await IdentityModel.findOneAndUpdate(
      { identityId },
      {
        $addToSet: { roles: role.trim() },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async removeRole(identityId: string, role: string): Promise<IdentityEntity | null> {
    const doc = await IdentityModel.findOneAndUpdate(
      { identityId },
      {
        $pull: { roles: role.trim() },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async clear(): Promise<void> {
    await IdentityModel.deleteMany({}).exec();
  }
}

export const identityRepository = new IdentityRepository();


import { PolicyModel } from "../models/policy.model.js";

export interface PolicyEntity {
  role: string;
  permissions: string[];
  assignedIdentities: string[];
  createdAt: string;
  updatedAt: string;
}

function toEntity(doc: any): PolicyEntity {
  return {
    role: doc.role,
    permissions: [...(doc.permissions ?? [])],
    assignedIdentities: [...(doc.assignedIdentities ?? [])],
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
  };
}

const DEFAULT_POLICIES: Record<string, string[]> = {
  employee: ["employee:read", "reports:read"],
  manager: ["employee:read", "reports:read", "payroll:read"],
  admin: ["employee:read", "reports:read", "payroll:read", "policies:manage"],
};

export class PolicyRepository {
  async seedDefaults(): Promise<void> {
    for (const [role, permissions] of Object.entries(DEFAULT_POLICIES)) {
      await PolicyModel.findOneAndUpdate(
        { role },
        {
          $setOnInsert: {
            role,
            assignedIdentities: [],
          },
          $addToSet: {
            permissions: { $each: permissions },
          },
        },
        { upsert: true, new: true },
      ).exec();
    }
  }

  async findByRole(role: string): Promise<PolicyEntity | null> {
    const doc = await PolicyModel.findOne({ role }).lean().exec();
    return doc ? toEntity(doc) : null;
  }

  async listAll(): Promise<PolicyEntity[]> {
    const docs = await PolicyModel.find().lean().exec();
    return docs.map(toEntity);
  }

  async grantPermission(role: string, permission: string): Promise<PolicyEntity> {
    const doc = await PolicyModel.findOneAndUpdate(
      { role: role.trim() },
      {
        $addToSet: { permissions: permission.trim() },
        $set: { updatedAt: new Date() },
      },
      { upsert: true, new: true },
    )
      .lean()
      .exec();
    return toEntity(doc);
  }

  async revokePermission(role: string, permission: string): Promise<PolicyEntity | null> {
    const doc = await PolicyModel.findOneAndUpdate(
      { role },
      {
        $pull: { permissions: permission.trim() },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async assignIdentity(role: string, identityId: string): Promise<PolicyEntity | null> {
    const doc = await PolicyModel.findOneAndUpdate(
      { role },
      {
        $addToSet: { assignedIdentities: identityId },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async removeIdentity(role: string, identityId: string): Promise<PolicyEntity | null> {
    const doc = await PolicyModel.findOneAndUpdate(
      { role },
      {
        $pull: { assignedIdentities: identityId },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    )
      .lean()
      .exec();
    return doc ? toEntity(doc) : null;
  }

  async clear(): Promise<void> {
    await PolicyModel.deleteMany({}).exec();
  }
}

export const policyRepository = new PolicyRepository();


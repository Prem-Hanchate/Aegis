import { ChallengeModel } from "../models/challenge.model.js";

export interface ChallengeEntity {
  nonce: string;
  walletAddress: string;
  domain: string;
  message: string;
  issuedAt: string;
  createdAt: string;
  expiresAt: string;
  purpose: string;
  used: boolean;
  usedAt: string | null;
}

function toEntity(doc: any): ChallengeEntity {
  const createdAtIso = doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt);
  return {
    nonce: doc.nonce,
    walletAddress: doc.walletAddress,
    domain: doc.domain,
    message: doc.message,
    issuedAt: createdAtIso,
    createdAt: createdAtIso,
    expiresAt: doc.expiresAt instanceof Date ? doc.expiresAt.toISOString() : String(doc.expiresAt),
    purpose: doc.purpose ?? "authentication",
    used: Boolean(doc.used),
    usedAt: doc.usedAt ? (doc.usedAt instanceof Date ? doc.usedAt.toISOString() : String(doc.usedAt)) : null,
  };
}

export class ChallengeRepository {
  async create(data: {
    nonce: string;
    walletAddress: string;
    domain: string;
    message: string;
    expiresAt: Date;
    purpose?: string;
    createdAt?: Date;
  }): Promise<ChallengeEntity> {
    const doc = await ChallengeModel.create({
      nonce: data.nonce,
      walletAddress: data.walletAddress,
      domain: data.domain,
      message: data.message,
      purpose: data.purpose ?? "authentication",
      createdAt: data.createdAt ?? new Date(),
      expiresAt: data.expiresAt,
      used: false,
      usedAt: null,
    });
    return toEntity(doc);
  }

  async findByNonce(nonce: string): Promise<ChallengeEntity | null> {
    const doc = await ChallengeModel.findOne({ nonce }).lean().exec();
    return doc ? toEntity(doc) : null;
  }

  /**
   * Consumes a challenge atomically:
   * Only succeeds if nonce exists, used is false, and it has not yet expired.
   * If two concurrent calls attempt to consume the same nonce, exactly one succeeds.
   */
  async consumeAtomic(nonce: string, now: Date = new Date()): Promise<ChallengeEntity | null> {
    const doc = await ChallengeModel.findOneAndUpdate(
      {
        nonce,
        used: false,
        expiresAt: { $gt: now },
      },
      {
        $set: {
          used: true,
          usedAt: now,
        },
      },
      { new: true },
    )
      .lean()
      .exec();

    return doc ? toEntity(doc) : null;
  }

  async clear(): Promise<void> {
    await ChallengeModel.deleteMany({}).exec();
  }
}

export const challengeRepository = new ChallengeRepository();


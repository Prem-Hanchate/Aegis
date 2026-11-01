import mongoose from "mongoose";
import type { LoginChallenge } from "./challenge.types.js";
import { challengeRepository } from "../../repositories/challenge.repository.js";

const challengeStore = new Map<string, LoginChallenge>();

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function saveChallenge(challenge: LoginChallenge) {
  challengeStore.set(challenge.nonce, challenge);

  if (isDbConnected()) {
    void challengeRepository.create({
      nonce: challenge.nonce,
      walletAddress: challenge.walletAddress,
      domain: challenge.domain,
      message: challenge.message,
      expiresAt: new Date(challenge.expiresAt),
      purpose: challenge.purpose,
      createdAt: new Date(challenge.issuedAt),
    }).catch((err) => {
      console.error("Failed to persist challenge to MongoDB:", err);
    });
  }
}

export function getChallenge(nonce: string) {
  return challengeStore.get(nonce) ?? null;
}

export async function getChallengeAsync(nonce: string): Promise<LoginChallenge | null> {
  if (isDbConnected()) {
    const doc = await challengeRepository.findByNonce(nonce);
    if (doc) {
      challengeStore.set(doc.nonce, doc);
      return doc;
    }
  }
  return getChallenge(nonce);
}

export function markChallengeUsed(nonce: string, usedAt: string) {
  const challenge = challengeStore.get(nonce);
  if (!challenge) {
    return null;
  }

  // In-memory atomic check
  if (challenge.used) {
    return null;
  }

  const updatedChallenge = {
    ...challenge,
    used: true,
    usedAt,
  };

  challengeStore.set(nonce, updatedChallenge);

  if (isDbConnected()) {
    void challengeRepository.consumeAtomic(nonce, new Date(usedAt)).catch((err) => {
      console.error("Failed to mark challenge used in MongoDB:", err);
    });
  }

  return updatedChallenge;
}

export async function markChallengeUsedAtomic(nonce: string, usedAt: string): Promise<LoginChallenge | null> {
  if (isDbConnected()) {
    const consumed = await challengeRepository.consumeAtomic(nonce, new Date(usedAt));
    if (!consumed) {
      // Either not found, already used, or expired
      return null;
    }
    challengeStore.set(nonce, consumed);
    return consumed;
  }

  return markChallengeUsed(nonce, usedAt);
}

export function clearChallengeStore() {
  challengeStore.clear();
  if (isDbConnected()) {
    void challengeRepository.clear().catch((err) => {
      console.error("Failed to clear challenges in MongoDB:", err);
    });
  }
}

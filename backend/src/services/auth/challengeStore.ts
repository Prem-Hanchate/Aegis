import type { LoginChallenge } from "./challenge.types.js";

const challengeStore = new Map<string, LoginChallenge>();

export function saveChallenge(challenge: LoginChallenge) {
  challengeStore.set(challenge.nonce, challenge);
}

export function getChallenge(nonce: string) {
  return challengeStore.get(nonce) ?? null;
}

export function markChallengeUsed(nonce: string, usedAt: string) {
  const challenge = challengeStore.get(nonce);
  if (!challenge) {
    return null;
  }

  const updatedChallenge = {
    ...challenge,
    used: true,
    usedAt,
  };

  challengeStore.set(nonce, updatedChallenge);
  return updatedChallenge;
}

export function clearChallengeStore() {
  challengeStore.clear();
}
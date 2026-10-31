import { AppError } from "../../middleware/AppError.js";
import { challengeRepository } from "../../repositories/index.js";
import type { LoginChallenge } from "./challenge.types.js";

export async function saveChallenge(challenge: LoginChallenge) { return challengeRepository.create(challenge); }
export async function getChallenge(nonce: string) { return challengeRepository.findByNonce(nonce); }
export async function markChallengeUsed(nonce: string, usedAt: string) {
  return challengeRepository.claim(nonce, new Date(usedAt));
}
export async function clearChallengeStore() {
  if (process.env.NODE_ENV !== "test") throw new AppError("Challenge store clearing is only available in tests.", 403, "TEST_ONLY_OPERATION");
  await challengeRepository.clear();
}

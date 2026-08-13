import type { AuthChallengeResponse, AuthVerificationResponse } from "../types/auth";

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function requestLoginChallenge(walletAddress: string) {
  return requestJson<AuthChallengeResponse>("/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ walletAddress }),
  });
}

export function verifyLoginChallenge(payload: {
  walletAddress: string;
  message: string;
  signature: string;
}) {
  return requestJson<AuthVerificationResponse>("/auth/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
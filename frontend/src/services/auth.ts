import type { AuthChallengeResponse, AuthMeResponse, AuthVerificationResponse } from "../types/auth";

async function requestJson<T>(path: string, init: RequestInit, accessToken?: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed with status ${response.status}`);
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

export function fetchCurrentSession(accessToken: string) {
  return requestJson<AuthMeResponse>("/auth/me", { method: "GET" }, accessToken);
}

export function logout(accessToken: string) {
  return requestJson<void>("/auth/logout", { method: "POST" }, accessToken);
}
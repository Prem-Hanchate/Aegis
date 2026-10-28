import type { AuthChallengeResponse, AuthMeResponse, AuthVerificationResponse } from "../types/auth";
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function requestJson<T>(path: string, init: RequestInit, accessToken?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    let errorCode: string | undefined;

    try {
      const body = (await response.json()) as { error?: { message?: string; code?: string } };
      if (body?.error?.message) {
        errorMessage = body.error.message;
      }
      if (body?.error?.code) {
        errorCode = body.error.code;
      }
    } catch {
      // Non-JSON response
    }

    throw new ApiError(errorMessage, response.status, errorCode);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return (await response.json()) as T;
}

export function requestLoginChallenge(walletAddress: string): Promise<AuthChallengeResponse> {
  return requestJson<AuthChallengeResponse>("/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ walletAddress }),
  });
}

export function verifyLoginChallenge(payload: {
  walletAddress: string;
  message: string;
  signature: string;
}): Promise<AuthVerificationResponse> {
  return requestJson<AuthVerificationResponse>("/auth/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchCurrentSession(accessToken: string): Promise<AuthMeResponse> {
  return requestJson<AuthMeResponse>("/auth/me", { method: "GET" }, accessToken);
}

export function logout(accessToken: string): Promise<void> {
  return requestJson<void>("/auth/logout", { method: "POST" }, accessToken);
}
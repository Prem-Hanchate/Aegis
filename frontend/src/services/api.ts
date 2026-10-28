import type { BackendHealthResponse } from "../types/health";
import { ApiError } from "./auth";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
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

export function requestProtectedJson<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  return requestJson<T>(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
}

export function fetchBackendHealth(): Promise<BackendHealthResponse> {
  return requestJson<BackendHealthResponse>("/health");
}

export interface ResourceAccessResponse {
  resource: string;
  data: string;
}

export function fetchResource(
  accessToken: string,
  resource: "employee" | "reports" | "payroll",
): Promise<ResourceAccessResponse> {
  return requestProtectedJson<ResourceAccessResponse>(`/resources/${resource}`, accessToken);
}

export interface DeviceSummary {
  deviceId: string;
  name: string;
  fingerprint: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  lastSeenAt: string;
}

export function fetchDevices(accessToken: string): Promise<{ devices: DeviceSummary[] }> {
  return requestProtectedJson<{ devices: DeviceSummary[] }>("/devices", accessToken);
}

export function enrollDevice(
  accessToken: string,
  payload: { name: string; fingerprint: string },
): Promise<{ device: DeviceSummary }> {
  return requestProtectedJson<{ device: DeviceSummary }>("/devices", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

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
  identityId?: string;
  name: string;
  fingerprint: string;
  status: "ACTIVE" | "REVOKED";
  createdAt?: string;
  lastSeenAt: string;
  revokedAt?: string | null;
}

export function fetchDevices(
  accessToken: string,
  filters: { status?: "ACTIVE" | "REVOKED"; seenSince?: string } = {},
): Promise<{ devices: DeviceSummary[] }> {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.seenSince) query.set("seenSince", filters.seenSince);
  const queryString = query.toString() ? `?${query.toString()}` : "";
  return requestProtectedJson<{ devices: DeviceSummary[] }>(`/devices${queryString}`, accessToken);
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

export function revokeDevice(
  accessToken: string,
  deviceId: string,
): Promise<{ device: DeviceSummary; transaction?: unknown }> {
  return requestProtectedJson<{ device: DeviceSummary; transaction?: unknown }>(
    `/devices/${deviceId}/revoke`,
    accessToken,
    { method: "PATCH" },
  );
}

export function replaceDevice(
  accessToken: string,
  deviceId: string,
  payload: { name: string; fingerprint: string },
): Promise<{ device: DeviceSummary; transaction?: unknown }> {
  return requestProtectedJson<{ device: DeviceSummary; transaction?: unknown }>(
    `/devices/${deviceId}/replace`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function heartbeatDevice(
  accessToken: string,
  deviceId: string,
): Promise<{ device: DeviceSummary }> {
  return requestProtectedJson<{ device: DeviceSummary }>(
    `/devices/${deviceId}/heartbeat`,
    accessToken,
    { method: "POST" },
  );
}

export function bindDevice(
  accessToken: string,
  deviceId: string,
): Promise<{ device: DeviceSummary; message: string }> {
  return requestProtectedJson<{ device: DeviceSummary; message: string }>(
    `/devices/${deviceId}/bind`,
    accessToken,
    { method: "POST" },
  );
}

export interface ManagedIdentity {
  identityId: string;
  walletAddress: string;
  displayName: string;
  status: "ACTIVE" | "REVOKED";
  roles: string[];
  createdAt: string;
}

export interface PolicyMap {
  [role: string]: string[];
}

export interface AuditEvent {
  eventId: string;
  eventType: string;
  identityId: string;
  resource: string;
  action: string;
  outcome: string;
  reason: string | null;
  timestamp: string;
}

export function fetchIdentities(accessToken: string): Promise<{ identities: ManagedIdentity[] }> {
  return requestProtectedJson<{ identities: ManagedIdentity[] }>("/identities", accessToken);
}

export function registerIdentity(
  accessToken: string,
  payload: { walletAddress: string; displayName: string },
): Promise<{ identity: ManagedIdentity }> {
  return requestProtectedJson<{ identity: ManagedIdentity }>("/identities", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateIdentityStatus(
  accessToken: string,
  identityId: string,
  status: "ACTIVE" | "REVOKED",
): Promise<{ identity: ManagedIdentity }> {
  return requestProtectedJson<{ identity: ManagedIdentity }>(`/identities/${identityId}/status`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function fetchPolicies(accessToken: string): Promise<{ policies: PolicyMap }> {
  return requestProtectedJson<{ policies: PolicyMap }>("/policies", accessToken);
}

export function grantPolicy(
  accessToken: string,
  payload: { role: string; resource: string; action: string },
): Promise<unknown> {
  return requestProtectedJson("/policies/permissions", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchAudit(
  accessToken: string,
  filters: { outcome?: string; eventType?: string; offset?: number; limit?: number } = {},
): Promise<{ total: number; events: AuditEvent[] }> {
  const query = new URLSearchParams({ limit: String(filters.limit ?? 10), offset: String(filters.offset ?? 0) });
  if (filters.outcome) query.set("outcome", filters.outcome);
  if (filters.eventType) query.set("eventType", filters.eventType);
  return requestProtectedJson<{ total: number; events: AuditEvent[] }>(`/audit?${query.toString()}`, accessToken);
}

export function fetchAuditSummary(accessToken: string): Promise<{
  summary: { total: number; byOutcome: Record<string, number>; byEventType: Record<string, number> };
}> {
  return requestProtectedJson<{
    summary: { total: number; byOutcome: Record<string, number>; byEventType: Record<string, number> };
  }>("/audit/summary", accessToken);
}

export function revokeAllSessions(accessToken: string): Promise<{ revokedCount: number }> {
  return requestProtectedJson<{ revokedCount: number }>("/auth/sessions/revoke-all", accessToken, {
    method: "POST",
  });
}

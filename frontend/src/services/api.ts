import type { BackendHealthResponse } from "../types/health";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function requestProtectedJson<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchBackendHealth() {
  return requestJson<BackendHealthResponse>("/health");
}

export interface DeviceSummary {
  deviceId: string;
  name: string;
  fingerprint: string;
  status: "ACTIVE" | "REVOKED";
  lastSeenAt: string;
}

export function fetchDevices(accessToken: string) {
  return requestProtectedJson<{ devices: DeviceSummary[] }>("/devices", accessToken);
}

export function fetchResource(accessToken: string, resource: "employee" | "reports" | "payroll") {
  return requestProtectedJson<{ resource: string; data: string }>(`/resources/${resource}`, accessToken);
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

export function fetchIdentities(accessToken: string) {
  return requestProtectedJson<{ identities: ManagedIdentity[] }>("/identities", accessToken);
}

export function registerIdentity(accessToken: string, payload: { walletAddress: string; displayName: string }) {
  return requestProtectedJson<{ identity: ManagedIdentity }>("/identities", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateIdentityStatus(accessToken: string, identityId: string, status: "ACTIVE" | "REVOKED") {
  return requestProtectedJson<{ identity: ManagedIdentity }>(`/identities/${identityId}/status`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function enrollDevice(accessToken: string, payload: { name: string; fingerprint: string }) {
  return requestProtectedJson<{ device: DeviceSummary }>("/devices", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function revokeDevice(accessToken: string, deviceId: string) {
  return requestProtectedJson<{ device: DeviceSummary }>(`/devices/${deviceId}/revoke`, accessToken, { method: "PATCH" });
}

export function replaceDevice(accessToken: string, deviceId: string, payload: { name: string; fingerprint: string }) {
  return requestProtectedJson<{ device: DeviceSummary }>(`/devices/${deviceId}/replace`, accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function heartbeatDevice(accessToken: string, deviceId: string) {
  return requestProtectedJson<{ device: DeviceSummary }>(`/devices/${deviceId}/heartbeat`, accessToken, { method: "POST" });
}

export function fetchPolicies(accessToken: string) {
  return requestProtectedJson<{ policies: PolicyMap }>("/policies", accessToken);
}

export function grantPolicy(accessToken: string, payload: { role: string; resource: string; action: string }) {
  return requestProtectedJson("/policies/permissions", accessToken, { method: "POST", body: JSON.stringify(payload) });
}

export function fetchAudit(accessToken: string, filters: { outcome?: string; eventType?: string; offset?: number; limit?: number } = {}) {
  const query = new URLSearchParams({ limit: String(filters.limit ?? 10), offset: String(filters.offset ?? 0) });
  if (filters.outcome) query.set("outcome", filters.outcome);
  if (filters.eventType) query.set("eventType", filters.eventType);
  return requestProtectedJson<{ total: number; events: AuditEvent[] }>(`/audit?${query.toString()}`, accessToken);
}

export function fetchAuditSummary(accessToken: string) {
  return requestProtectedJson<{ summary: { total: number; byOutcome: Record<string, number>; byEventType: Record<string, number> } }>("/audit/summary", accessToken);
}

export function revokeAllSessions(accessToken: string) {
  return requestProtectedJson<{ revokedCount: number }>("/auth/sessions/revoke-all", accessToken, { method: "POST" });
}

import type { BackendHealthResponse } from "../types/health";
import { ApiError } from "./auth";
import { createBrowserDeviceKey, signBrowserDeviceProof, storeBrowserDevice } from "./device-crypto";

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
  const storedSession = typeof window !== "undefined" ? sessionStorage.getItem("aegis.auth.session") : null;
  let sessionId: string | undefined;
  if (storedSession) {
    try {
      sessionId = (JSON.parse(storedSession) as { session?: { sessionId?: string } }).session?.sessionId;
    } catch {
      sessionId = undefined;
    }
  }
  const timestamp = new Date().toISOString();
  const proof = sessionId
    ? signBrowserDeviceProof({
        sessionId,
        method: init.method ?? "GET",
        path: `/api${path}`,
        timestamp,
      })
    : null;
  const requestHeaders: Record<string, string> = {
    ...((init.headers ?? {}) as Record<string, string>),
  };
  if (proof) {
    requestHeaders["X-Aegis-Device-Timestamp"] = proof.timestamp;
    requestHeaders["X-Aegis-Device-Signature"] = proof.signature;
  }
  init = { ...init, headers: requestHeaders };
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
  identityId: string;
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
  publicKey?: string | null;
  approvalStatus?: "LEGACY" | "PENDING" | "APPROVED";
  approvedAt?: string | null;
  approvedBy?: string | null;
  permissions?: string[];
}

export function updateDevicePermissions(
  accessToken: string,
  deviceId: string,
  permissions: string[],
): Promise<{ device: DeviceSummary }> {
  return requestProtectedJson<{ device: DeviceSummary }>(`/devices/${deviceId}/permissions`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ permissions }),
  });
}

export function fetchDevices(
  accessToken: string,
  filters: { status?: "ACTIVE" | "REVOKED"; seenSince?: string; scope?: "all" } = {},
): Promise<{ devices: DeviceSummary[] }> {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.seenSince) query.set("seenSince", filters.seenSince);
  if (filters.scope) query.set("scope", filters.scope);
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

export function pairDevice(
  accessToken: string,
  payload: { name: string; publicKey: string },
): Promise<{ device: DeviceSummary }> {
  return requestProtectedJson<{ device: DeviceSummary }>("/devices/pair", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function pairBrowserDevice(
  accessToken: string,
  name: string,
): Promise<{ device: DeviceSummary }> {
  const key = createBrowserDeviceKey(name);
  const response = await pairDevice(accessToken, {
    name,
    publicKey: key.publicKey,
  });
  storeBrowserDevice({
    ...key,
    deviceId: response.device.deviceId,
  });
  return response;
}

export function approveDevice(
  accessToken: string,
  deviceId: string,
): Promise<{ device: DeviceSummary }> {
  return requestProtectedJson<{ device: DeviceSummary }>(`/devices/${deviceId}/approve`, accessToken, {
    method: "PATCH",
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
  updatedAt?: string;
}

export function fetchIdentity(accessToken: string, identityId: string): Promise<{ identity: ManagedIdentity }> {
  return requestProtectedJson<{ identity: ManagedIdentity }>(`/identities/${identityId}`, accessToken);
}

export interface PolicyMap {
  [role: string]: string[];
}

export interface AuditEvent {
  eventId: string;
  eventType: string;
  identityId: string | null;
  resource: string | null;
  action: string | null;
  outcome: string;
  reason: string | null;
  actor: string | null;
  timestamp: string;
}

export function fetchIdentities(
  accessToken: string,
  filters: { search?: string; status?: "ACTIVE" | "REVOKED" } = {},
): Promise<{ identities: ManagedIdentity[] }> {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.status) query.set("status", filters.status);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestProtectedJson<{ identities: ManagedIdentity[] }>(`/identities${suffix}`, accessToken);
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

export function updateIdentityProfile(
  accessToken: string,
  identityId: string,
  displayName: string,
): Promise<{ identity: ManagedIdentity }> {
  return requestProtectedJson<{ identity: ManagedIdentity }>(`/identities/${identityId}/profile`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });
}

export function assignIdentityRole(
  accessToken: string,
  identityId: string,
  role: string,
): Promise<{ identity: ManagedIdentity }> {
  return requestProtectedJson<{ identity: ManagedIdentity }>(`/identities/${identityId}/roles`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function removeIdentityRole(
  accessToken: string,
  identityId: string,
  role: string,
): Promise<{ identity: ManagedIdentity }> {
  return requestProtectedJson<{ identity: ManagedIdentity }>(`/identities/${identityId}/roles`, accessToken, {
    method: "DELETE",
    body: JSON.stringify({ role }),
  });
}

export function fetchPolicies(accessToken: string): Promise<{ policies: PolicyMap }> {
  return requestProtectedJson<{ policies: PolicyMap }>("/policies", accessToken);
}

export function grantPolicy(
  accessToken: string,
  payload: { role: string; resource: string; action: string },
): Promise<{ policy: { role: string; permissions: string[] }; transaction?: unknown }> {
  return requestProtectedJson<{ policy: { role: string; permissions: string[] }; transaction?: unknown }>("/policies/permissions", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function revokePolicy(
  accessToken: string,
  role: string,
  payload: { resource: string; action: string },
): Promise<{ policy: { role: string; permissions: string[] }; transaction?: unknown }> {
  return requestProtectedJson<{ policy: { role: string; permissions: string[] }; transaction?: unknown }>(
    `/policies/${encodeURIComponent(role)}/permissions`,
    accessToken,
    {
      method: "DELETE",
      body: JSON.stringify(payload),
    },
  );
}

export function fetchAudit(
  accessToken: string,
  filters: { identityId?: string; outcome?: string; eventType?: string; offset?: number; limit?: number } = {},
): Promise<{ total: number; events: AuditEvent[] }> {
  const query = new URLSearchParams({ limit: String(filters.limit ?? 10), offset: String(filters.offset ?? 0) });
  if (filters.identityId) query.set("identityId", filters.identityId);
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

export interface AuditBatch {
  batchId: number;
  rootHash: string;
  batchSize: number;
  txHash: string | null;
  blockNumber: number | null;
  status: "ANCHORED" | "FAILED" | "PENDING";
  failureReason?: string | null;
  anchoredAt: string;
}

export function fetchAuditBatches(accessToken: string): Promise<{ batches: AuditBatch[] }> {
  return requestProtectedJson<{ batches: AuditBatch[] }>("/audit/batches", accessToken);
}

export function anchorAuditBatch(accessToken: string, limit = 50): Promise<{ batch: AuditBatch }> {
  return requestProtectedJson<{ batch: AuditBatch }>("/audit/anchor", accessToken, {
    method: "POST",
    body: JSON.stringify({ limit }),
  });
}

export interface AuditBatchVerification {
  batchId: number;
  valid: boolean;
  invalidEventIds: string[];
}

export function verifyAuditBatch(accessToken: string, batchId: number): Promise<{ verification: AuditBatchVerification }> {
  return requestProtectedJson<{ verification: AuditBatchVerification }>(`/audit/batches/${batchId}/verify`, accessToken);
}

export function revokeAllSessions(accessToken: string): Promise<{ revokedCount: number }> {
  return requestProtectedJson<{ revokedCount: number }>("/auth/sessions/revoke-all", accessToken, {
    method: "POST",
  });
}

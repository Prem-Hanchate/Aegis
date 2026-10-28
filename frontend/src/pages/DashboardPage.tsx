import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthState } from "../context/auth";
import {
  fetchBackendHealth,
  fetchDevices,
  fetchResource,
  type DeviceSummary,
  type ResourceAccessResponse,
} from "../services/api";
import { ApiError } from "../services/auth";
import type { BackendHealthResponse } from "../types/health";

type ResourceName = "employee" | "reports" | "payroll";

export function DashboardPage() {
  const { state, clearSession } = useAuthState();
  const navigate = useNavigate();

  // Health state
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Device state
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);

  // Resource test state
  const [testedResource, setTestedResource] = useState<ResourceName | null>(null);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceResult, setResourceResult] = useState<ResourceAccessResponse | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);

  const accessToken = state.session?.accessToken;

  // Load operational backend health
  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const response = await fetchBackendHealth();
        if (!cancelled) {
          setHealth(response);
          setHealthError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setHealthError(error instanceof Error ? error.message : "Unable to reach backend.");
        }
      } finally {
        if (!cancelled) {
          setHealthLoading(false);
        }
      }
    }

    void loadHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load active devices
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setDeviceLoading(true);

    fetchDevices(accessToken)
      .then((response) => {
        if (!cancelled) setDevices(response.devices);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          if (error instanceof ApiError && (error.status === 401 || error.code === "SESSION_EXPIRED")) {
            clearSession("Your session has expired. Please log in again.");
          }
          setDevices([]);
        }
      })
      .finally(() => {
        if (!cancelled) setDeviceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, clearSession]);

  async function handleTestResource(resourceName: ResourceName) {
    if (!accessToken) return;

    setTestedResource(resourceName);
    setResourceLoading(true);
    setResourceResult(null);
    setResourceError(null);

    try {
      const result = await fetchResource(accessToken, resourceName);
      setResourceResult(result);
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        if (error.status === 401 || error.code === "SESSION_EXPIRED") {
          clearSession("Your session has expired or is invalid. Please log in again.");
          return;
        }
        setResourceError(error.message);
      } else if (error instanceof Error) {
        setResourceError(error.message);
      } else {
        setResourceError("Authorization check failed.");
      }
    } finally {
      setResourceLoading(false);
    }
  }

  const activeDeviceCount = devices.filter((device) => device.status === "ACTIVE").length;

  return (
    <section className="dashboard-grid">
      {/* Identity Overview */}
      <div className="panel panel-featured">
        <p className="eyebrow">Zero Trust Identity Profile</p>
        <h2>{state.identity?.displayName ?? "Authenticated Operator"}</h2>
        <p className="muted-text">
          Cryptographically authenticated via Ethereum wallet challenge-response. All access is policy-evaluated.
        </p>

        <div className="identity-block">
          <div className="identity-line">
            <span className="status-dot" title="Active Identity" />
            <span className="wallet-code">{state.identity?.walletAddress}</span>
          </div>
          <div className="identity-meta">
            <small>ID: {state.identity?.identityId}</small>
          </div>
        </div>

        <div className="roles-container">
          <span className="roles-label">Assigned Roles:</span>
          <div className="status-row">
            {state.roles.length > 0 ? (
              state.roles.map((role) => (
                <span className="status-badge" key={role}>
                  {role}
                </span>
              ))
            ) : (
              <span className="status-badge status-badge-muted">No roles assigned</span>
            )}
          </div>
        </div>
      </div>

      {/* Session Posture */}
      <div className="panel">
        <h3>Session Security Posture</h3>
        <p className="muted-text">Real-time status of your active session.</p>
        <ul className="details-list">
          <li>
            <span>State</span>
            <strong className="success-text">Active (Bearer)</strong>
          </li>
          <li>
            <span>Session ID</span>
            <small title={state.session?.sessionId}>
              {state.session?.sessionId ? `${state.session.sessionId.slice(0, 8)}...` : "-"}
            </small>
          </li>
          <li>
            <span>Expires</span>
            <strong>
              {state.session?.expiresAt
                ? new Date(state.session.expiresAt).toLocaleTimeString()
                : "-"}
            </strong>
          </li>
          <li>
            <span>Enrolled Devices</span>
            <strong>
              {deviceLoading ? "Checking..." : `${activeDeviceCount} active`}
            </strong>
          </li>
          <li>
            <span>Bound Hardware</span>
            <strong>
              {state.deviceId ? (
                <span className="success-text" title={state.deviceId}>
                  {state.deviceId.slice(0, 8)}... (Bound)
                </span>
              ) : (
                <span className="error-text">None (Unbound)</span>
              )}
            </strong>
          </li>
        </ul>
        <div style={{ marginTop: "16px" }}>
          <Link to="/devices" className="button-link" style={{ width: "100%", justifyContent: "center" }}>
            Manage Devices & Hardware →
          </Link>
        </div>
      </div>

      {/* Live Resource Access Evaluation */}
      <div className="panel resource-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Zero Trust Evaluation</p>
            <h3>Live Resource Verification</h3>
          </div>
          <span className="status-badge status-badge-muted">Real Backend Path</span>
        </div>
        <p className="muted-text">
          Evaluate access to protected endpoints against your active session, role, and permissions.
        </p>

        <div className="resource-actions">
          {(["employee", "reports", "payroll"] as const).map((resourceName) => (
            <button
              className={`resource-button ${testedResource === resourceName ? "resource-button-active" : ""}`}
              key={resourceName}
              type="button"
              disabled={resourceLoading}
              onClick={() => void handleTestResource(resourceName)}
            >
              Test {resourceName}
            </button>
          ))}
        </div>

        {resourceLoading && (
          <p className="muted-text">Evaluating Zero Trust policy on backend...</p>
        )}

        {resourceResult && (
          <div className="access-result access-granted" role="status">
            <div className="access-header">
              <span className="status-dot" />
              <strong>ACCESS ALLOWED: {resourceResult.resource.toUpperCase()}</strong>
            </div>
            <p className="access-body">{resourceResult.data}</p>
          </div>
        )}

        {resourceError && (
          <div className="access-result access-denied" role="alert">
            <div className="access-header">
              <span className="status-dot status-dot-denied" />
              <strong>ACCESS DENIED: {testedResource?.toUpperCase()}</strong>
            </div>
            <p className="access-body">{resourceError}</p>
          </div>
        )}
      </div>

      {/* Operational Backend Health */}
      <div className="panel">
        <h3>Backend Diagnostics</h3>
        <p className="muted-text">Real-time infrastructure health.</p>
        {healthLoading ? <p>Checking backend connectivity...</p> : null}
        {healthError ? <p className="error-text">{healthError}</p> : null}
        {health ? (
          <ul className="details-list">
            <li>
              <span>Status</span>
              <strong className="success-text">{health.status}</strong>
            </li>
            <li>
              <span>Service</span>
              <strong>{health.service}</strong>
            </li>
            <li>
              <span>Environment</span>
              <strong>{health.environment}</strong>
            </li>
            <li>
              <span>Database</span>
              <strong>
                {health.database.connected ? "Connected" : "Standby / In-Memory"}
              </strong>
            </li>
          </ul>
        ) : null}
      </div>

      {/* Dedicated Resource Authorization Pages */}
      <div className="panel resource-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Dedicated Views</p>
            <h3>Protected Resource Pages</h3>
          </div>
          <span className="status-badge status-badge-muted">Direct Views</span>
        </div>
        <p className="muted-text">Navigate directly to dedicated resource authorization pages.</p>
        <div className="resource-actions">
          {(["employee", "reports", "payroll"] as const).map((resourceName) => (
            <button
              className="resource-button"
              key={resourceName}
              type="button"
              onClick={() => navigate(`/resources/${resourceName}`)}
            >
              View {resourceName} ↗
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

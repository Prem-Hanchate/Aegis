import { useEffect, useState } from "react";
import { fetchBackendHealth } from "../services/api";
import { fetchDevices, type DeviceSummary } from "../services/api";
import { useAuthState } from "../context/auth";
import { useNavigate } from "react-router-dom";
import type { BackendHealthResponse } from "../types/health";

export function DashboardPage() {
  const { state } = useAuthState();
  const navigate = useNavigate();
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const response = await fetchBackendHealth();
        if (!cancelled) {
          setHealth(response);
          setError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Unable to reach backend.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.session) return;
    void fetchDevices(state.session.accessToken)
      .then((response) => setDevices(response.devices))
      .catch(() => setDevices([]));
  }, [state.session]);

  function openResource(resourceName: "employee" | "reports" | "payroll") {
    navigate(`/resources/${resourceName}`);
  }

  return (
    <section className="dashboard-grid">
      <div className="panel panel-featured">
        <p className="eyebrow">Authenticated workspace</p>
        <h2>Welcome back, {state.identity?.displayName ?? "Aegis operator"}.</h2>
        <p>Every request is checked against your identity, active session, enrolled device, and assigned policy.</p>
        <div className="identity-line"><span className="status-dot" />{state.identity?.walletAddress}</div>
        <div className="status-row">
          {state.roles.length ? state.roles.map((role) => <span className="status-badge" key={role}>{role}</span>) : <span className="status-badge status-badge-muted">No roles assigned</span>}
        </div>
      </div>

      <div className="panel">
        <h3>Session posture</h3>
        <ul className="details-list">
          <li><span>Session</span><strong>Active</strong></li>
          <li><span>Expires</span><strong>{state.session ? new Date(state.session.expiresAt).toLocaleTimeString() : "-"}</strong></li>
          <li><span>Devices</span><strong>{devices.filter((device) => device.status === "ACTIVE").length} active</strong></li>
        </ul>
      </div>

      <div className="panel">
        <h3>Backend health</h3>
        {loading ? <p>Checking backend connectivity...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {health ? (
          <ul className="details-list">
            <li>Status: {health.status}</li>
            <li>Service: {health.service}</li>
            <li>Environment: {health.environment}</li>
            <li>Database: {health.database.connected ? "connected" : "not connected yet"}</li>
          </ul>
        ) : null}
      </div>

      <div className="panel resource-panel">
        <div className="panel-heading"><div><p className="eyebrow">Policy-gated</p><h3>Protected resources</h3></div><span className="status-badge status-badge-muted">Live checks</span></div>
        <div className="resource-actions">
          {(["employee", "reports", "payroll"] as const).map((resourceName) => <button className="resource-button" key={resourceName} type="button" onClick={() => void openResource(resourceName)}>{resourceName}</button>)}
        </div>
        <p className="muted-text">Choose a resource to open its dedicated authorization view.</p>
      </div>
    </section>
  );
}

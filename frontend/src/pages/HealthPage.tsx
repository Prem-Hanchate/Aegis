import { useCallback, useEffect, useState } from "react";
import { fetchBackendHealth } from "../services/api";
import type { BackendHealthResponse } from "../types/health";

export function HealthPage() {
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = useCallback(() => {
    setLoading(true);
    return fetchBackendHealth()
      .then((response) => {
        setHealth(response);
        setError(null);
      })
      .catch((error) => {
        setError(error instanceof Error ? error.message : "Unable to reach backend.");
        setHealth(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  return (
    <section className="health-page">
      <div className="control-header">
        <div>
          <p className="eyebrow">Monitoring</p>
          <h2>System health</h2>
          <p className="muted-text">Operational status for the Aegis backend and connected data services.</p>
        </div>
        <button className="quiet-button" type="button" onClick={() => void loadHealth()} disabled={loading}>
          {loading ? "Checking..." : "Refresh status"}
        </button>
      </div>
      {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
      {loading && !health ? <p className="muted-text" role="status">Checking backend connectivity...</p> : null}
      {health ? (
        <>
          <div className="health-grid">
            <div className="panel health-card">
              <span className="meta-label">Backend</span>
              <strong className="health-value health-value-success">{health.status}</strong>
              <small>{health.service}</small>
            </div>
            <div className="panel health-card">
              <span className="meta-label">Database</span>
              <strong className={`health-value ${health.database.connected ? "health-value-success" : "health-value-danger"}`}>
                {health.database.connected ? "Connected" : "Disconnected"}
              </strong>
              <small>{health.database.name ?? "No database name reported"}</small>
            </div>
            <div className="panel health-card">
              <span className="meta-label">Environment</span>
              <strong className="health-value">{health.environment}</strong>
              <small>Last checked {new Date(health.timestamp).toLocaleString()}</small>
            </div>
          </div>
          <details className="panel health-details">
            <summary>Technical response</summary>
            <pre className="code-block">{JSON.stringify(health, null, 2)}</pre>
          </details>
        </>
      ) : null}
    </section>
  );
}

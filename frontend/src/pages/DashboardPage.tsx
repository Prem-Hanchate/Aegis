import { useEffect, useState } from "react";
import { fetchBackendHealth } from "../services/api";
import type { BackendHealthResponse } from "../types/health";

export function DashboardPage() {
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
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

  return (
    <section className="hero-grid">
      <div className="panel panel-large">
        <p className="eyebrow">Phase 1 foundation</p>
        <h2>Wallet authentication and Zero Trust authorization will land here.</h2>
        <p>
          This shell already separates frontend routing, backend APIs, contract scaffolding, and shared security
          boundaries so later phases can add identity, device, session, and policy logic without refactoring the base.
        </p>
        <div className="status-row">
          <span className="status-badge status-badge-muted">React</span>
          <span className="status-badge status-badge-muted">Express</span>
          <span className="status-badge status-badge-muted">Hardhat</span>
        </div>
      </div>

      <div className="panel">
        <h3>Phase 2 authentication</h3>
        <p>
          The backend now exposes <code>/api/auth/challenge</code> and <code>/api/auth/verify</code> for wallet-based
          challenge-response authentication with nonce replay protection.
        </p>
        <p>Frontend auth service methods are ready for MetaMask integration in the next UI pass.</p>
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
    </section>
  );
}

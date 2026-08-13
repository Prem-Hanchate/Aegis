import { useEffect, useState } from "react";
import { fetchBackendHealth } from "../services/api";
import type { BackendHealthResponse } from "../types/health";

export function HealthPage() {
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBackendHealth()
      .then((response) => {
        setHealth(response);
        setError(null);
      })
      .catch((error) => {
        setError(error instanceof Error ? error.message : "Unable to reach backend.");
      });
  }, []);

  return (
    <section className="panel panel-large">
      <p className="eyebrow">Connectivity</p>
      <h2>Backend health snapshot</h2>
      {error ? <p className="error-text">{error}</p> : null}
      {health ? (
        <pre className="code-block">{JSON.stringify(health, null, 2)}</pre>
      ) : (
        <p>Loading backend status...</p>
      )}
    </section>
  );
}

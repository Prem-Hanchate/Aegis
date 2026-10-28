import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthState } from "../context/auth";
import { fetchResource } from "../services/api";

const resources = ["employee", "reports", "payroll"] as const;
type ResourceName = (typeof resources)[number];

export function ResourcePage() {
  const { resource } = useParams();
  const { state } = useAuthState();
  const resourceName = resources.includes(resource as ResourceName) ? resource as ResourceName : "employee";
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.session) return;
    setData(null);
    setError(null);
    void fetchResource(state.session.accessToken, resourceName)
      .then((response) => setData(response.data))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Access denied."));
  }, [resourceName, state.session]);

  return (
    <section className="resource-view">
      <div className="panel panel-featured">
        <p className="eyebrow">Policy-gated resource</p>
        <h2>{resourceName} workspace</h2>
        <p>Access is evaluated by the backend using your active identity, session, enrolled device, role, and permission.</p>
        {data ? <div className="access-result access-granted"><span className="status-dot" /><strong>Access allowed</strong><p>{data}</p></div> : null}
        {error ? <div className="access-result access-denied"><strong>Access denied</strong><p>{error}</p></div> : null}
        {!data && !error ? <p className="muted-text">Checking your authorization...</p> : null}
      </div>
    </section>
  );
}
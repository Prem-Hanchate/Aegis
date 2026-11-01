import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthState } from "../context/auth";
import { fetchResource } from "../services/api";
import { ApiError } from "../services/auth";

const resources = ["employee", "reports", "payroll"] as const;
type ResourceName = (typeof resources)[number];

export function ResourcePage() {
  const { resource } = useParams();
  const { state } = useAuthState();
  const resourceName = resources.includes(resource as ResourceName) ? resource as ResourceName : "employee";
  const [data, setData] = useState<string | null>(null);
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!state.session) return;
    setData(null);
    setIdentityId(null);
    setError(null);
    setForbidden(false);
    setLoading(true);
    void fetchResource(state.session.accessToken, resourceName)
      .then((response) => {
        setData(response.data);
        setIdentityId(response.identityId);
      })
      .catch((requestError) => {
        if (requestError instanceof ApiError && requestError.status === 403) {
          setForbidden(true);
          setError(requestError.message);
        } else {
          setError(requestError instanceof Error ? requestError.message : "The resource could not be loaded.");
        }
      })
      .finally(() => setLoading(false));
  }, [resourceName, state.session]);

  return (
    <section className="resource-view">
      <div className="panel panel-featured">
        <p className="eyebrow">Policy-gated resource</p>
        <h2>{resourceName} workspace</h2>
        <p>Access is evaluated by the backend using your active identity, session, enrolled device, role, and permission.</p>
        {data ? <div className="access-result access-granted"><span className="status-dot" /><strong>Access allowed</strong><p>{data}</p><small>Response identity: {identityId}</small></div> : null}
        {error ? <div className="access-result access-denied"><strong>{forbidden ? "Access denied by policy" : "Resource unavailable"}</strong><p>{error}</p><small>{forbidden ? "Your session and device were recognized, but the backend denied this resource." : "Check the network connection and try again."}</small></div> : null}
        {loading ? <p className="muted-text">Checking your authorization...</p> : null}
      </div>
    </section>
  );
}
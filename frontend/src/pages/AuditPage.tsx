import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthState } from "../context/auth";
import { ApiError } from "../services/auth";
import { fetchAudit, fetchAuditSummary, type AuditEvent } from "../services/api";

const pageSize = 10;
const outcomes = ["", "ALLOWED", "DENIED", "SUCCESS", "FAILURE"] as const;

function outcomeLabel(outcome: string) {
  if (outcome === "ALLOWED") return "✓ Allowed";
  if (outcome === "DENIED") return "! Denied";
  if (outcome === "FAILURE") return "× Failed";
  return "✓ Success";
}

function formatValue(value: string | null) {
  return value || "—";
}

export function AuditPage() {
  const { state } = useAuthState();
  const accessToken = state.session?.accessToken ?? "";
  const canView = state.permissions.includes("policies:manage");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{ total: number; byOutcome: Record<string, number>; byEventType: Record<string, number> } | null>(null);
  const [identityId, setIdentityId] = useState("");
  const [eventType, setEventType] = useState("");
  const [outcome, setOutcome] = useState<(typeof outcomes)[number]>("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFilter, setInvalidFilter] = useState(false);

  useEffect(() => {
    if (!accessToken || !canView) return;
    let active = true;
    setLoading(true);
    setError(null);
    setInvalidFilter(false);

    Promise.all([
      fetchAudit(accessToken, { identityId: identityId || undefined, eventType: eventType || undefined, outcome: outcome || undefined, limit: pageSize, offset }),
      fetchAuditSummary(accessToken),
    ])
      .then(([auditResponse, summaryResponse]) => {
        if (!active) return;
        setEvents(auditResponse.events);
        setTotal(auditResponse.total);
        setSummary(summaryResponse.summary);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof ApiError && requestError.status === 400) {
          setInvalidFilter(true);
          setError("One or more filters are invalid. Use the supported values and try again.");
        } else {
          setError(requestError instanceof Error ? requestError.message : "The audit data could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, canView, identityId, eventType, outcome, offset]);

  function resetPage() {
    setOffset(0);
  }

  if (!canView) {
    return (
      <section className="resource-view">
        <div className="panel access-result access-denied">
          <p className="eyebrow">Security audit</p>
          <h2>Access denied</h2>
          <p>Audit data is restricted to administrators with the policies:manage permission. The backend remains the security boundary.</p>
        </div>
      </section>
    );
  }

  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + events.length, total);

  return (
    <section className="audit-page">
      <div className="control-header">
        <div>
          <p className="eyebrow">Administrator evidence</p>
          <h2>Security audit</h2>
          <p className="muted-text">Review recorded authentication, access decisions, policy changes, and administrative activity.</p>
        </div>
      </div>

      <div className="audit-notice" role="note">
        This dashboard reports events recorded by the running backend. Events are currently held in memory; this view does not prove durable storage, tamper resistance, or complete historical coverage.
      </div>

      {summary ? (
        <div className="audit-summary-grid" aria-label="Audit summary">
          <div className="panel audit-summary-card"><span>Total events</span><strong>{summary.total}</strong></div>
          <div className="panel audit-summary-card audit-summary-allowed"><span>✓ Allowed</span><strong>{summary.byOutcome.ALLOWED ?? 0}</strong></div>
          <div className="panel audit-summary-card audit-summary-denied"><span>! Denied</span><strong>{summary.byOutcome.DENIED ?? 0}</strong></div>
          <div className="panel audit-summary-card audit-summary-success"><span>✓ Success</span><strong>{summary.byOutcome.SUCCESS ?? 0}</strong></div>
          <div className="panel audit-summary-card audit-summary-failed"><span>× Failed</span><strong>{summary.byOutcome.FAILURE ?? 0}</strong></div>
        </div>
      ) : null}

      <section className="panel audit-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Event stream</p><h3>Recorded security events</h3></div>
          <span className="status-badge status-badge-muted">{total} events</span>
        </div>

        <div className="audit-filters audit-filters-expanded">
          <label>Identity ID<input aria-label="Audit identity" maxLength={128} placeholder="Filter by identity" value={identityId} onChange={(event) => { setIdentityId(event.target.value); resetPage(); }} /></label>
          <label>Event type<input aria-label="Audit event type" maxLength={64} placeholder="e.g. ACCESS_DECISION" value={eventType} onChange={(event) => { setEventType(event.target.value); resetPage(); }} /></label>
          <label>Outcome<select aria-label="Audit outcome" value={outcome} onChange={(event) => { setOutcome(event.target.value as (typeof outcomes)[number]); resetPage(); }}><option value="">All outcomes</option>{outcomes.slice(1).map((value) => <option key={value} value={value}>{outcomeLabel(value)}</option>)}</select></label>
        </div>

        {loading ? <p className="muted-text" role="status">Loading audit events...</p> : null}
        {invalidFilter ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
        {!loading && error && !invalidFilter ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
        {!loading && !error && events.length === 0 ? (
          <div className="audit-empty-state">
            <div className="audit-empty-icon" aria-hidden="true">◎</div>
            <div>
              <h3>{total === 0 ? "Audit collection is ready" : "No matching events"}</h3>
              <p>
                {total === 0
                  ? "This development instance has not recorded an event since its last restart. Use the live controls below to generate real security activity."
                  : "No recorded events match the current filters. Clear a filter or return to the first page to continue reviewing activity."}
              </p>
              {total === 0 ? (
                <div className="row-actions">
                  <Link className="resource-button" to="/control-center">Open control center</Link>
                  <Link className="quiet-button" to="/policies">Review policies</Link>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {!loading && !error && events.length > 0 ? (
          <div className="audit-table-wrap">
            <table className="audit-table">
              <caption className="sr-only">Security audit events</caption>
              <thead><tr><th scope="col">Timestamp</th><th scope="col">Outcome</th><th scope="col">Event</th><th scope="col">Actor / identity</th><th scope="col">Resource / action</th><th scope="col">Reason</th></tr></thead>
              <tbody>{events.map((event) => (
                <tr key={event.eventId}>
                  <td><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time></td>
                  <td><span className={`audit-outcome audit-outcome-${event.outcome.toLowerCase()}`}>{outcomeLabel(event.outcome)}</span></td>
                  <td><strong>{event.eventType}</strong><small>{event.eventId}</small></td>
                  <td><span>{formatValue(event.actor)}</span><small>{formatValue(event.identityId)}</small></td>
                  <td><span>{formatValue(event.resource)}</span><small>{formatValue(event.action)}</small></td>
                  <td>{formatValue(event.reason)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}

        <div className="pagination" aria-label="Audit pagination">
          <button className="quiet-button" type="button" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</button>
          <span>Showing {first}-{last} of {total}</span>
          <button className="quiet-button" type="button" disabled={loading || offset + events.length >= total || events.length === 0} onClick={() => setOffset(offset + pageSize)}>Next</button>
        </div>
      </section>
    </section>
  );
}

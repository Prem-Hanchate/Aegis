import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthState } from "../context/auth";
import {
  approveDevice,
  fetchAudit,
  fetchAuditSummary,
  fetchDevices,
  fetchIdentities,
  fetchPendingDevices,
  fetchPolicies,
  revokeAllSessions,
  type AuditEvent,
  type DeviceSummary,
  type ManagedIdentity,
  type PolicyMap,
} from "../services/api";

type AuditSummary = {
  total: number;
  byOutcome: Record<string, number>;
  byEventType: Record<string, number>;
};

function shorten(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

export function ControlCenterPage() {
  const { state, clearSession } = useAuthState();
  const navigate = useNavigate();
  const accessToken = state.session?.accessToken ?? "";
  const [identities, setIdentities] = useState<ManagedIdentity[]>([]);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [pendingDevices, setPendingDevices] = useState<DeviceSummary[]>([]);
  const [policies, setPolicies] = useState<PolicyMap>({});
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRevokeAll, setConfirmingRevokeAll] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);

  async function refresh() {
    if (!accessToken) return;
    setLoading(true);
    const results = await Promise.allSettled([
      fetchIdentities(accessToken),
      fetchDevices(accessToken),
      fetchPendingDevices(accessToken),
      fetchPolicies(accessToken),
      fetchAudit(accessToken, { limit: 6 }),
      fetchAuditSummary(accessToken),
    ]);

    const [identityResult, deviceResult, pendingResult, policyResult, auditResult, summaryResult] = results;
    if (identityResult.status === "fulfilled") setIdentities(identityResult.value.identities);
    if (deviceResult.status === "fulfilled") setDevices(deviceResult.value.devices);
    if (pendingResult.status === "fulfilled") setPendingDevices(pendingResult.value.devices);
    if (policyResult.status === "fulfilled") setPolicies(policyResult.value.policies);
    if (auditResult.status === "fulfilled") setEvents(auditResult.value.events);
    if (summaryResult.status === "fulfilled") setSummary(summaryResult.value.summary);

    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") {
      setError(rejected.reason instanceof Error ? rejected.reason.message : "Some control center data could not be loaded.");
    } else {
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, [accessToken]);

  async function handleApproveDevice(deviceId: string) {
    if (!accessToken) return;
    setApprovingId(deviceId);
    setError(null);
    setMessage(null);
    try {
      const response = await approveDevice(accessToken, deviceId);
      setMessage(`Device "${response.device.name}" approved for unrestricted access.`);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to approve device.");
    } finally {
      setApprovingId(null);
    }
  }

  async function handleRevokeAllSessions() {
    if (!accessToken || revokingAll) return;
    setRevokingAll(true);
    setError(null);
    try {
      const response = await revokeAllSessions(accessToken);
      setMessage(`${response.revokedCount} active session${response.revokedCount === 1 ? "" : "s"} revoked.`);
      setConfirmingRevokeAll(false);
      clearSession("All sessions were revoked. Please authenticate again.");
      navigate("/login", { replace: true });
    } catch (requestError) {
      if (requestError instanceof Error) setError(requestError.message);
      else setError("All sessions could not be revoked.");
    } finally {
      setRevokingAll(false);
    }
  }

  const activeIdentities = identities.filter((identity) => identity.status === "ACTIVE").length;
  const activeDevices = devices.filter((device) => device.status === "ACTIVE").length;
  const deniedEvents = summary?.byOutcome.DENIED ?? 0;

  return (
    <section className="control-center">
      <div className="control-header">
        <div>
          <p className="eyebrow">Operations overview</p>
          <h2>Control center</h2>
          <p className="muted-text">Monitor security posture and jump to the authoritative management workflows.</p>
        </div>
        <div className="control-header-actions">
          <button className="quiet-button" type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh overview"}
          </button>
          {!confirmingRevokeAll ? (
            <button className="danger-button" type="button" onClick={() => setConfirmingRevokeAll(true)}>
              Revoke all sessions
            </button>
          ) : (
            <div className="inline-confirmation" role="alertdialog" aria-label="Confirm revoke all sessions">
              <span>Invalidate every active session?</span>
              <button className="danger-button" type="button" onClick={() => void handleRevokeAllSessions()} disabled={revokingAll}>
                {revokingAll ? "Revoking..." : "Confirm"}
              </button>
              <button className="quiet-button" type="button" onClick={() => setConfirmingRevokeAll(false)} disabled={revokingAll}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {message ? <div className="feedback feedback-success" role="status">{message}</div> : null}
      {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}

      <div className="overview-metrics">
        <div className="panel metric-card"><span className="meta-label">Identities</span><strong>{activeIdentities} active</strong><small>{identities.length} registered</small></div>
        <div className="panel metric-card"><span className="meta-label">Devices</span><strong>{activeDevices} active</strong><small>{devices.length - activeDevices} revoked</small></div>
        <div className="panel metric-card">
          <span className="meta-label">Pending Devices</span>
          <strong className={pendingDevices.length > 0 ? "error-text" : "success-text"}>
            {pendingDevices.length} pending
          </strong>
          <small>Temporary access</small>
        </div>
        <div className="panel metric-card"><span className="meta-label">Denied access</span><strong className={deniedEvents ? "error-text" : "success-text"}>{deniedEvents}</strong><small>Recorded audit events</small></div>
      </div>

      {pendingDevices.length > 0 && (
        <section className="panel" style={{ marginTop: "20px" }}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Zero Trust Hardware Governance</p>
              <h3>Pending Device Approvals ({pendingDevices.length})</h3>
            </div>
            <span className="status-badge status-badge-warning">Action Required</span>
          </div>
          <p className="muted-text">
            Employees with newly enrolled devices are restricted to temporary access until an administrator approves their hardware.
          </p>
          <div className="table-responsive">
            <table className="data-table" style={{ width: "100%", marginTop: "12px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Device Name</th>
                  <th style={{ textAlign: "left" }}>Operator / Identity</th>
                  <th style={{ textAlign: "left" }}>Fingerprint</th>
                  <th style={{ textAlign: "left" }}>Enrolled</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingDevices.map((device) => (
                  <tr key={device.deviceId}>
                    <td><strong>{device.name}</strong></td>
                    <td>{device.identityDisplayName ?? "Employee"}</td>
                    <td><code>{device.fingerprint.slice(0, 16)}...</code></td>
                    <td>{device.createdAt ? new Date(device.createdAt).toLocaleTimeString() : "-"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="primary-button"
                        style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                        disabled={approvingId === device.deviceId}
                        onClick={() => void handleApproveDevice(device.deviceId)}
                      >
                        {approvingId === device.deviceId ? "Approving..." : "Approve (Unrestricted)"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="control-grid">
        <section className="panel control-section">
          <div className="panel-heading"><div><p className="eyebrow">Management</p><h3>Authoritative workflows</h3></div></div>
          <p className="muted-text">Use dedicated screens for validated, confirmable changes. This overview does not duplicate mutation forms.</p>
          <div className="quick-links">
            <Link className="quick-link-card" to="/identities"><strong>Identity management</strong><span>Register identities, update profiles and manage roles.</span></Link>
            <Link className="quick-link-card" to="/devices"><strong>Device management</strong><span>Enroll, bind, replace and revoke trusted devices.</span></Link>
            <Link className="quick-link-card" to="/policies"><strong>Roles &amp; permissions</strong><span>Review and change the live policy map.</span></Link>
            <Link className="quick-link-card" to="/health"><strong>System health</strong><span>Review backend and database connectivity.</span></Link>
          </div>
        </section>

        <section className="panel control-section">
          <div className="panel-heading"><div><p className="eyebrow">Audit</p><h3>Recent access activity</h3></div><span className="status-badge status-badge-muted">{summary?.total ?? 0} events</span></div>
          {events.length === 0 ? <p className="muted-text">No recent audit events are available.</p> : (
            <div className="audit-list">
              {events.map((event) => (
                <div className="data-row" key={event.eventId}>
                  <div><strong>{event.resource}:{event.action}</strong><small>{event.eventType} · {new Date(event.timestamp).toLocaleString()}</small></div>
                  <span className={event.outcome === "DENIED" ? "audit-denied" : "audit-allowed"}>{event.outcome}</span>
                </div>
              ))}
            </div>
          )}
          {summary ? <p className="muted-text audit-summary">Showing the latest events. {summary.byOutcome.ALLOWED ?? 0} allowed and {summary.byOutcome.DENIED ?? 0} denied decisions recorded.</p> : null}
        </section>
      </div>
    </section>
  );
}

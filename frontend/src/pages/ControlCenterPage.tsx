import { useEffect, useState } from "react";
import { useAuthState } from "../context/auth";
import {
  enrollDevice,
  fetchAudit,
  fetchAuditSummary,
  fetchDevices,
  fetchIdentities,
  fetchPolicies,
  grantPolicy,
  heartbeatDevice,
  registerIdentity,
  replaceDevice,
  revokeAllSessions,
  revokeDevice,
  updateIdentityStatus,
  type AuditEvent,
  type DeviceSummary,
  type ManagedIdentity,
  type PolicyMap,
} from "../services/api";

const initialMessage = "Manage identity, device, policy, and audit controls from one place.";

export function ControlCenterPage() {
  const { state, setState } = useAuthState();
  const accessToken = state.session?.accessToken ?? "";
  const [identities, setIdentities] = useState<ManagedIdentity[]>([]);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [policies, setPolicies] = useState<PolicyMap>({});
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [summary, setSummary] = useState<{ byOutcome: Record<string, number>; byEventType: Record<string, number> } | null>(null);
  const [auditOutcome, setAuditOutcome] = useState("");
  const [auditEventType, setAuditEventType] = useState("");
  const [auditOffset, setAuditOffset] = useState(0);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [message, setMessage] = useState(initialMessage);
  const [identityForm, setIdentityForm] = useState({ walletAddress: "", displayName: "" });
  const [deviceForm, setDeviceForm] = useState({ name: "", fingerprint: "" });
  const [replacementForm, setReplacementForm] = useState({ name: "", fingerprint: "" });
  const [policyForm, setPolicyForm] = useState({ role: "employee", resource: "", action: "read" });

  async function refresh() {
    if (!accessToken) return;
    const results = await Promise.allSettled([
      fetchIdentities(accessToken), fetchDevices(accessToken), fetchPolicies(accessToken), fetchAudit(accessToken, { outcome: auditOutcome || undefined, eventType: auditEventType || undefined, offset: auditOffset }), fetchAuditSummary(accessToken),
    ]);
    const [identityResult, deviceResult, policyResult, auditResult, summaryResult] = results;
    if (identityResult.status === "fulfilled") setIdentities(identityResult.value.identities);
    if (deviceResult.status === "fulfilled") setDevices(deviceResult.value.devices);
    if (policyResult.status === "fulfilled") setPolicies(policyResult.value.policies);
    if (auditResult.status === "fulfilled") { setEvents(auditResult.value.events); setAuditTotal(auditResult.value.total); }
    if (summaryResult.status === "fulfilled") setSummary(summaryResult.value.summary);
  }

  useEffect(() => { void refresh(); }, [accessToken, auditOutcome, auditEventType, auditOffset]);

  async function runAction(action: () => Promise<unknown>, success: string) {
    try { await action(); setMessage(success); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The action could not be completed."); }
  }

  async function handleRegisterIdentity(event: React.FormEvent) {
    event.preventDefault();
    await runAction(() => registerIdentity(accessToken, identityForm), "Identity registered successfully.");
    setIdentityForm({ walletAddress: "", displayName: "" });
  }

  async function handleEnrollDevice(event: React.FormEvent) {
    event.preventDefault();
    await runAction(() => enrollDevice(accessToken, deviceForm), "Device enrolled and bound to this session.");
    setDeviceForm({ name: "", fingerprint: "" });
  }

  async function handleGrantPolicy(event: React.FormEvent) {
    event.preventDefault();
    await runAction(() => grantPolicy(accessToken, policyForm), "Permission granted to the role.");
    setPolicyForm({ ...policyForm, resource: "" });
  }

  async function handleReplaceDevice(event: React.FormEvent) {
    event.preventDefault();
    if (!replaceTarget) return;
    await runAction(() => replaceDevice(accessToken, replaceTarget, replacementForm), "Device replaced and bound to this session.");
    setReplacementForm({ name: "", fingerprint: "" });
    setReplaceTarget(null);
  }

  return (
    <section className="control-center">
      <div className="control-header">
        <div><p className="eyebrow">Operations console</p><h2>Control center</h2><p className="muted-text">{message}</p></div>
        <button className="quiet-button" type="button" onClick={() => void runAction(() => revokeAllSessions(accessToken), "All active sessions were revoked.")}>Revoke all sessions</button>
      </div>

      <div className="control-grid">
        <section className="panel control-section"><div className="panel-heading"><div><p className="eyebrow">01 / Identity</p><h3>Identity registry</h3></div><span className="status-badge status-badge-muted">{identities.length} records</span></div>
          <form className="inline-form" onSubmit={(event) => void handleRegisterIdentity(event)}><input aria-label="Display name" placeholder="Display name" value={identityForm.displayName} onChange={(event) => setIdentityForm({ ...identityForm, displayName: event.target.value })} required /><input aria-label="Wallet address" placeholder="0x wallet address" value={identityForm.walletAddress} onChange={(event) => setIdentityForm({ ...identityForm, walletAddress: event.target.value })} required /><button className="resource-button" type="submit">Register</button></form>
          <div className="data-list">{identities.map((identity) => <div className="data-row" key={identity.identityId}><div><strong>{identity.displayName}</strong><small>{identity.walletAddress}</small></div><button className="row-action" type="button" onClick={() => void runAction(() => updateIdentityStatus(accessToken, identity.identityId, identity.status === "ACTIVE" ? "REVOKED" : "ACTIVE"), `${identity.displayName} is now ${identity.status === "ACTIVE" ? "revoked" : "active"}.`)}>{identity.status}</button></div>)}</div>
        </section>

        <section className="panel control-section"><div className="panel-heading"><div><p className="eyebrow">02 / Devices</p><h3>Device posture</h3></div><span className="status-badge status-badge-muted">{devices.filter((device) => device.status === "ACTIVE").length} active</span></div>
          <form className="inline-form" onSubmit={(event) => void handleEnrollDevice(event)}><input aria-label="Device name" placeholder="Device name" value={deviceForm.name} onChange={(event) => setDeviceForm({ ...deviceForm, name: event.target.value })} required /><input aria-label="Device fingerprint" placeholder="Fingerprint" minLength={8} value={deviceForm.fingerprint} onChange={(event) => setDeviceForm({ ...deviceForm, fingerprint: event.target.value })} required /><button className="resource-button" type="submit">Enroll</button></form>
          {replaceTarget ? <form className="inline-form replace-form" onSubmit={(event) => void handleReplaceDevice(event)}><input aria-label="Replacement device name" placeholder="Replacement name" value={replacementForm.name} onChange={(event) => setReplacementForm({ ...replacementForm, name: event.target.value })} required /><input aria-label="Replacement fingerprint" placeholder="New fingerprint" minLength={8} value={replacementForm.fingerprint} onChange={(event) => setReplacementForm({ ...replacementForm, fingerprint: event.target.value })} required /><button className="resource-button" type="submit">Replace</button><button className="quiet-button" type="button" onClick={() => setReplaceTarget(null)}>Cancel</button></form> : null}
          <div className="data-list">{devices.map((device) => <div className="data-row" key={device.deviceId}><div><strong>{device.name}</strong><small>Last seen {new Date(device.lastSeenAt).toLocaleString()}</small></div>{device.status === "ACTIVE" ? <div className="row-actions"><button className="row-action" type="button" onClick={() => void runAction(() => heartbeatDevice(accessToken, device.deviceId), "Device heartbeat recorded.")}>Ping</button><button className="row-action" type="button" onClick={() => setReplaceTarget(device.deviceId)}>Replace</button><button className="row-action danger-action" type="button" onClick={() => void runAction(() => revokeDevice(accessToken, device.deviceId), "Device revoked.")}>Revoke</button></div> : <span className="status-badge status-badge-muted">REVOKED</span>}</div>)}</div>
        </section>

        <section className="panel control-section"><div className="panel-heading"><div><p className="eyebrow">03 / Policy</p><h3>Role permissions</h3></div></div>
          <form className="inline-form" onSubmit={(event) => void handleGrantPolicy(event)}><select aria-label="Role" value={policyForm.role} onChange={(event) => setPolicyForm({ ...policyForm, role: event.target.value })}><option>employee</option><option>manager</option><option>admin</option></select><input aria-label="Resource" placeholder="Resource" value={policyForm.resource} onChange={(event) => setPolicyForm({ ...policyForm, resource: event.target.value })} required /><input aria-label="Action" placeholder="Action" value={policyForm.action} onChange={(event) => setPolicyForm({ ...policyForm, action: event.target.value })} required /><button className="resource-button" type="submit">Grant</button></form>
          <div className="policy-list">{Object.entries(policies).map(([role, permissions]) => <div key={role}><strong>{role}</strong><span>{permissions.join(" · ")}</span></div>)}</div>
        </section>

        <section className="panel control-section"><div className="panel-heading"><div><p className="eyebrow">04 / Audit</p><h3>Access activity</h3></div><span className="status-badge status-badge-muted">{auditTotal} events</span></div>
          {summary ? <div className="metric-row"><div><strong>{summary.byOutcome.ALLOWED ?? 0}</strong><small>Allowed</small></div><div><strong>{summary.byOutcome.DENIED ?? 0}</strong><small>Denied</small></div><div><strong>{summary.byEventType.ACCESS_DECISION ?? 0}</strong><small>Decisions</small></div></div> : null}
          <div className="audit-filters"><select aria-label="Audit outcome" value={auditOutcome} onChange={(event) => { setAuditOutcome(event.target.value); setAuditOffset(0); }}><option value="">All outcomes</option><option value="ALLOWED">Allowed</option><option value="DENIED">Denied</option><option value="SUCCESS">Success</option><option value="FAILURE">Failure</option></select><input aria-label="Audit event type" placeholder="Event type" value={auditEventType} onChange={(event) => { setAuditEventType(event.target.value); setAuditOffset(0); }} /></div>
          <div className="audit-list">{events.slice(0, 6).map((event) => <div className="data-row" key={event.eventId}><div><strong>{event.resource}:{event.action}</strong><small>{new Date(event.timestamp).toLocaleString()}</small></div><span className={event.outcome === "DENIED" ? "audit-denied" : "audit-allowed"}>{event.outcome}</span></div>)}</div>
          <div className="pagination"><button className="quiet-button" type="button" disabled={auditOffset === 0} onClick={() => setAuditOffset(Math.max(0, auditOffset - 10))}>Previous</button><span>Showing {auditTotal === 0 ? 0 : auditOffset + 1}-{Math.min(auditOffset + events.length, auditTotal)} of {auditTotal}</span><button className="quiet-button" type="button" disabled={auditOffset + events.length >= auditTotal} onClick={() => setAuditOffset(auditOffset + 10)}>Next</button></div>
        </section>
      </div>
    </section>
  );
}
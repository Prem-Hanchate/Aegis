import { useEffect, useState } from "react";
import { useAuthState } from "../context/auth";
import { ApiError } from "../services/auth";
import { fetchPolicies, grantPolicy, revokePolicy, type PolicyMap } from "../services/api";

const roles = ["employee", "manager", "admin"] as const;
const permissions = [
  { resource: "employee", action: "read", label: "Employee records" },
  { resource: "reports", action: "read", label: "Reports" },
  { resource: "payroll", action: "read", label: "Payroll" },
  { resource: "policies", action: "manage", label: "Policy management" },
] as const;
type PermissionOption = (typeof permissions)[number];

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 403) return "You are not authorized to manage policies.";
  if (error instanceof Error) return error.message;
  return fallback;
}

export function PolicyManagementPage() {
  const { state } = useAuthState();
  const accessToken = state.session?.accessToken ?? "";
  const canManage = state.permissions.includes("policies:manage");
  const [policies, setPolicies] = useState<PolicyMap>({});
  const [selectedRole, setSelectedRole] = useState<(typeof roles)[number]>("employee");
  const [selectedPermission, setSelectedPermission] = useState<PermissionOption>(permissions[0]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [transaction, setTransaction] = useState<unknown>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function refresh() {
    if (!accessToken || !canManage) return;
    setLoading(true);
    try {
      const response = await fetchPolicies(accessToken);
      setPolicies(response.policies);
      setError(null);
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to load current policies."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [accessToken, canManage]);

  async function mutate(kind: "grant" | "revoke", role: string, resource: string, action: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setTransaction(null);
    try {
      const response = kind === "grant"
        ? await grantPolicy(accessToken, { role, resource, action })
        : await revokePolicy(accessToken, role, { resource, action });
      setMessage(`${resource}:${action} was ${kind === "grant" ? "granted to" : "revoked from"} ${role}.`);
      setTransaction(response.transaction ?? null);
      setConfirming(null);
      await refresh();
    } catch (requestError) {
      setError(errorMessage(requestError, "The policy change could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <section className="resource-view">
        <div className="panel access-result access-denied">
          <p className="eyebrow">Policy administration</p>
          <h2>Access denied</h2>
          <p>Your current roles do not grant the policies:manage permission. The backend remains the security boundary.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="control-center">
      <div className="control-header">
        <div>
          <p className="eyebrow">Authorization control</p>
          <h2>Policy management</h2>
          <p className="muted-text">Review the live role-permission map and change only supported policy entries.</p>
        </div>
      </div>

      {message ? <div className="feedback feedback-success" role="status">{message}</div> : null}
      {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
      {transaction ? <div className="feedback feedback-success">Blockchain transaction: <code>{JSON.stringify(transaction)}</code></div> : null}

      <div className="control-grid">
        <section className="panel control-section">
          <div className="panel-heading"><div><p className="eyebrow">Live state</p><h3>Roles and permissions</h3></div></div>
          {loading ? <p className="muted-text">Loading current policies...</p> : null}
          {!loading && Object.keys(policies).length === 0 ? <p className="muted-text">No policy records are available.</p> : null}
          <div className="policy-list">
            {Object.entries(policies).map(([role, rolePermissions]) => (
              <div className="policy-card" key={role}>
                <strong>{role}</strong>
                <div className="status-row">
                  {rolePermissions.length
                    ? rolePermissions.map((permission) => <span className="status-badge" key={permission}>{permission}</span>)
                    : <span className="status-badge status-badge-muted">No permissions</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel control-section">
          <div className="panel-heading"><div><p className="eyebrow">Mutation</p><h3>Change a permission</h3></div></div>
          <label>Role<select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as (typeof roles)[number])}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
          <label>Permission<select value={`${selectedPermission.resource}:${selectedPermission.action}`} onChange={(event) => setSelectedPermission(permissions.find((permission) => `${permission.resource}:${permission.action}` === event.target.value) ?? permissions[0])}>{permissions.map((permission) => <option key={`${permission.resource}:${permission.action}`} value={`${permission.resource}:${permission.action}`}>{permission.label} ({permission.resource}:{permission.action})</option>)}</select></label>
          <p className="muted-text">Granting changes access for every active identity with this role. Revoking removes that access on the next authorization check.</p>
          <div className="row-actions">
            <button className="resource-button" type="button" disabled={busy} onClick={() => void mutate("grant", selectedRole, selectedPermission.resource, selectedPermission.action)}>Grant permission</button>
            {confirming === `${selectedRole}:${selectedPermission.resource}:${selectedPermission.action}` ? (
              <>
                <button className="row-action danger-action" type="button" disabled={busy} onClick={() => void mutate("revoke", selectedRole, selectedPermission.resource, selectedPermission.action)}>Confirm revoke</button>
                <button className="quiet-button" type="button" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
              </>
            ) : (
              <button className="row-action danger-action" type="button" disabled={busy} onClick={() => setConfirming(`${selectedRole}:${selectedPermission.resource}:${selectedPermission.action}`)}>Revoke permission</button>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "../context/auth";
import {
  assignIdentityRole,
  fetchIdentities,
  removeIdentityRole,
  registerIdentity,
  updateIdentityProfile,
  updateIdentityStatus,
  type ManagedIdentity,
} from "../services/api";
import { ApiError } from "../services/auth";

type Confirmation = { kind: "revoke" | "remove-role"; identity: ManagedIdentity; role?: string } | null;

function isWalletAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function IdentityAdministrationPage() {
  const { state } = useAuthState();
  const accessToken = state.session?.accessToken ?? "";
  const [identities, setIdentities] = useState<ManagedIdentity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "REVOKED">("ALL");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [registration, setRegistration] = useState({ walletAddress: "", displayName: "" });
  const [profileName, setProfileName] = useState("");
  const [role, setRole] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  const canManage = state.permissions.includes("policies:manage");

  async function refresh(preferredId?: string | null) {
    if (!accessToken || !canManage) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIdentities(accessToken);
      setIdentities(result.identities);
      setSelectedId((current) => preferredId ?? current ?? result.identities[0]?.identityId ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load identities.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [accessToken, canManage]);

  const filteredIdentities = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return identities.filter((identity) => {
      const matchesStatus = statusFilter === "ALL" || identity.status === statusFilter;
      const matchesSearch = !normalizedSearch
        || identity.displayName.toLowerCase().includes(normalizedSearch)
        || identity.walletAddress.toLowerCase().includes(normalizedSearch)
        || identity.roles.some((assignedRole) => assignedRole.toLowerCase().includes(normalizedSearch));
      return matchesStatus && matchesSearch;
    });
  }, [identities, search, statusFilter]);

  const selectedIdentity = identities.find((identity) => identity.identityId === selectedId) ?? null;

  useEffect(() => {
    setProfileName(selectedIdentity?.displayName ?? "");
    setRole("");
  }, [selectedIdentity?.identityId, selectedIdentity?.displayName]);

  async function runMutation(action: () => Promise<{ identity: ManagedIdentity }>, success: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      setMessage(success);
      await refresh(result.identity.identityId);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The identity action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    if (!isWalletAddress(registration.walletAddress)) {
      setError("Enter a valid Ethereum wallet address.");
      return;
    }
    if (!registration.displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    await runMutation(
      () => registerIdentity(accessToken, {
        walletAddress: registration.walletAddress.trim(),
        displayName: registration.displayName.trim(),
      }),
      "Identity registered successfully.",
    );
    setRegistration({ walletAddress: "", displayName: "" });
  }

  async function confirmAction() {
    if (!confirmation) return;
    const target = confirmation.identity;
    if (confirmation.kind === "revoke") {
      await runMutation(
        () => updateIdentityStatus(accessToken, target.identityId, "REVOKED"),
        `${target.displayName} was revoked and active sessions were invalidated.`,
      );
    } else if (confirmation.role) {
      await runMutation(
        () => removeIdentityRole(accessToken, target.identityId, confirmation.role as string),
        `Removed ${confirmation.role} from ${target.displayName}.`,
      );
    }
    setConfirmation(null);
  }

  if (!canManage) {
    return (
      <section className="panel" role="alert">
        <p className="eyebrow">Administrative access</p>
        <h2>Identity administration unavailable</h2>
        <p className="muted-text">Your current roles do not grant the policies:manage permission.</p>
      </section>
    );
  }

  return (
    <section className="identity-admin">
      <div className="control-header">
        <div>
          <p className="eyebrow">Administrative access</p>
          <h2>Identity administration</h2>
          <p className="muted-text">Register and manage identity status, profile data, and roles.</p>
        </div>
        <span className="status-badge status-badge-muted">{identities.length} identities</span>
      </div>

      {message ? <div className="success-message" role="status">{message}</div> : null}
      {error ? <div className="error-message" role="alert">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">01 / Register</p><h3>Register an identity</h3></div>
        </div>
        <form className="inline-form" onSubmit={(event) => void handleRegister(event)}>
          <input
            aria-label="Identity display name"
            placeholder="Display name"
            value={registration.displayName}
            onChange={(event) => setRegistration({ ...registration, displayName: event.target.value })}
            maxLength={120}
            required
          />
          <input
            aria-label="Identity wallet address"
            placeholder="0x wallet address"
            value={registration.walletAddress}
            onChange={(event) => setRegistration({ ...registration, walletAddress: event.target.value })}
            required
          />
          <button className="resource-button" type="submit" disabled={busy}>Register identity</button>
        </form>
      </section>

      <div className="identity-admin-grid">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">02 / Directory</p><h3>Identity directory</h3></div></div>
          <div className="inline-form">
            <input aria-label="Search identities" placeholder="Search name, wallet, or role" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select aria-label="Filter identity status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>
          {loading ? <p className="muted-text">Loading identities...</p> : null}
          {!loading && !error && filteredIdentities.length === 0 ? <p className="muted-text">No identities match the current filters.</p> : null}
          <div className="data-list">
            {filteredIdentities.map((identity) => (
              <button
                className={`identity-list-row ${identity.identityId === selectedId ? "identity-list-row-selected" : ""}`}
                type="button"
                key={identity.identityId}
                onClick={() => setSelectedId(identity.identityId)}
              >
                <span><strong>{identity.displayName}</strong><small>{identity.walletAddress}</small></span>
                <span className={`status-badge ${identity.status === "ACTIVE" ? "status-badge-active" : "status-badge-denied"}`}>{identity.status}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">03 / Detail</p>
          {!selectedIdentity ? <p className="muted-text">Select an identity to view details.</p> : (
            <>
              <div className="panel-heading">
                <div><h3>{selectedIdentity.displayName}</h3><p className="wallet-value">{selectedIdentity.walletAddress}</p></div>
                <span className={`status-badge ${selectedIdentity.status === "ACTIVE" ? "status-badge-active" : "status-badge-denied"}`}>{selectedIdentity.status}</span>
              </div>
              <p className="metadata-value">Identity ID: {selectedIdentity.identityId}</p>
              <p className="metadata-value">Created: {new Date(selectedIdentity.createdAt).toLocaleString()}</p>
              {selectedIdentity.updatedAt ? <p className="metadata-value">Updated: {new Date(selectedIdentity.updatedAt).toLocaleString()}</p> : null}

              <form className="stacked-form" onSubmit={(event) => { event.preventDefault(); void runMutation(() => updateIdentityProfile(accessToken, selectedIdentity.identityId, profileName), "Display name updated."); }}>
                <label>Display name<input value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={120} required /></label>
                <button className="resource-button" type="submit" disabled={busy || profileName.trim() === selectedIdentity.displayName}>Save profile</button>
              </form>

              <div className="role-management">
                <strong>Roles</strong>
                <div className="role-list">
                  {selectedIdentity.roles.length === 0 ? <span className="muted-text">No roles assigned.</span> : selectedIdentity.roles.map((assignedRole) => (
                    <span className="role-chip" key={assignedRole}>
                      {assignedRole}
                      <button type="button" aria-label={`Remove ${assignedRole} role`} disabled={busy} onClick={() => setConfirmation({ kind: "remove-role", identity: selectedIdentity, role: assignedRole })}>×</button>
                    </span>
                  ))}
                </div>
                <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (role.trim()) void runMutation(() => assignIdentityRole(accessToken, selectedIdentity.identityId, role.trim()), "Role assigned successfully."); setRole(""); }}>
                  <input aria-label="Role to assign" placeholder="Role name" value={role} onChange={(event) => setRole(event.target.value)} maxLength={50} required />
                  <button className="resource-button" type="submit" disabled={busy}>Assign role</button>
                </form>
              </div>

              <div className="identity-actions">
                {selectedIdentity.status === "ACTIVE" ? (
                  <button className="danger-button" type="button" disabled={busy} onClick={() => setConfirmation({ kind: "revoke", identity: selectedIdentity })}>Revoke identity</button>
                ) : (
                  <button className="resource-button" type="button" disabled={busy} onClick={() => void runMutation(() => updateIdentityStatus(accessToken, selectedIdentity.identityId, "ACTIVE"), "Identity activated successfully.")}>Activate identity</button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {confirmation ? (
        <div className="confirmation-panel" role="alertdialog" aria-labelledby="identity-confirmation-title">
          <h3 id="identity-confirmation-title">{confirmation.kind === "revoke" ? "Revoke identity?" : "Remove role?"}</h3>
          <p className="muted-text">
            {confirmation.kind === "revoke"
              ? `Revoking ${confirmation.identity.displayName} invalidates active sessions and prevents future authentication.`
              : `Remove ${confirmation.role} from ${confirmation.identity.displayName}?`}
          </p>
          <div className="row-actions">
            <button className="danger-button" type="button" disabled={busy} onClick={() => void confirmAction()}>Confirm</button>
            <button className="quiet-button" type="button" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

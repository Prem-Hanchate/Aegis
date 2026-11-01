import { useEffect, useState } from "react";
import { useAuthState } from "../context/auth";
import {
  bindDevice,
  enrollDevice,
  fetchDevices,
  heartbeatDevice,
  replaceDevice,
  revokeDevice,
  type DeviceSummary,
} from "../services/api";
import { ApiError } from "../services/auth";

function generateBrowserFingerprint(): string {
  const nav = typeof navigator !== "undefined" ? navigator : ({} as Navigator);
  const screenObj = typeof screen !== "undefined" ? screen : { width: 1920, height: 1080, colorDepth: 24 };
  const raw = `${nav.userAgent || "browser"}-${screenObj.width}x${screenObj.height}-${screenObj.colorDepth}-${nav.language || "en"}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `fp-${hex}-${Date.now().toString(16).slice(-6)}`;
}

export function DeviceManagementPage() {
  const { state, setDeviceId, clearSession } = useAuthState();
  const accessToken = state.session?.accessToken;

  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "REVOKED">("ALL");

  // Notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Enrollment Form State
  const [enrollName, setEnrollName] = useState("");
  const [enrollFingerprint, setEnrollFingerprint] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  // Revocation Confirmation Dialog State
  const [deviceToRevoke, setDeviceToRevoke] = useState<DeviceSummary | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Replacement Modal State
  const [deviceToReplace, setDeviceToReplace] = useState<DeviceSummary | null>(null);
  const [replaceName, setReplaceName] = useState("");
  const [replaceFingerprint, setReplaceFingerprint] = useState("");
  const [replacing, setReplacing] = useState(false);

  // In-flight action tracking
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  async function loadDevices() {
    if (!accessToken) return;
    try {
      const response = await fetchDevices(accessToken);
      setDevices(response.devices);
    } catch (error: unknown) {
      handleApiError(error, "Failed to load devices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDevices();
  }, [accessToken]);

  function handleApiError(error: unknown, defaultMessage: string) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.code === "SESSION_EXPIRED") {
        clearSession("Your session has expired. Please log in again.");
        return;
      }
      setErrorMessage(error.message);
    } else if (error instanceof Error) {
      setErrorMessage(error.message);
    } else {
      setErrorMessage(defaultMessage);
    }
  }

  function clearAlerts() {
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  // --- Enrollment ---
  async function handleEnroll(event: React.FormEvent) {
    event.preventDefault();
    clearAlerts();

    if (!accessToken) return;
    const name = enrollName.trim();
    const fingerprint = enrollFingerprint.trim();

    if (!name) {
      setErrorMessage("Device name is required.");
      return;
    }
    if (fingerprint.length < 8) {
      setErrorMessage("Device fingerprint must be at least 8 characters.");
      return;
    }

    setEnrolling(true);
    try {
      const response = await enrollDevice(accessToken, { name, fingerprint });
      setEnrollName("");
      setEnrollFingerprint("");
      setDeviceId(response.device.deviceId);
      setSuccessMessage(`Device "${response.device.name}" enrolled and bound to this session.`);
      await loadDevices();
    } catch (error: unknown) {
      handleApiError(error, "Device enrollment failed.");
    } finally {
      setEnrolling(false);
    }
  }

  // --- Session Binding ---
  async function handleBind(device: DeviceSummary) {
    clearAlerts();
    if (!accessToken) return;

    setActionInProgressId(device.deviceId);
    try {
      const response = await bindDevice(accessToken, device.deviceId);
      setDeviceId(response.device.deviceId);
      setSuccessMessage(`Device "${device.name}" is now bound to your active session.`);
      await loadDevices();
    } catch (error: unknown) {
      handleApiError(error, "Failed to bind device.");
    } finally {
      setActionInProgressId(null);
    }
  }

  // --- Heartbeat ---
  async function handleHeartbeat(device: DeviceSummary) {
    clearAlerts();
    if (!accessToken) return;

    setActionInProgressId(device.deviceId);
    try {
      const response = await heartbeatDevice(accessToken, device.deviceId);
      setSuccessMessage(`Heartbeat ping confirmed for "${device.name}".`);
      setDevices((current) =>
        current.map((d) => (d.deviceId === device.deviceId ? { ...d, lastSeenAt: response.device.lastSeenAt } : d)),
      );
    } catch (error: unknown) {
      handleApiError(error, "Heartbeat failed.");
    } finally {
      setActionInProgressId(null);
    }
  }

  // --- Revocation ---
  async function confirmRevoke() {
    if (!accessToken || !deviceToRevoke) return;
    clearAlerts();

    setRevoking(true);
    try {
      await revokeDevice(accessToken, deviceToRevoke.deviceId);
      if (state.deviceId === deviceToRevoke.deviceId) {
        setDeviceId(null);
      }
      setSuccessMessage(`Device "${deviceToRevoke.name}" was successfully revoked.`);
      setDeviceToRevoke(null);
      await loadDevices();
    } catch (error: unknown) {
      handleApiError(error, "Device revocation failed.");
    } finally {
      setRevoking(false);
    }
  }

  // --- Replacement ---
  async function confirmReplace(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken || !deviceToReplace) return;
    clearAlerts();

    const name = replaceName.trim();
    const fingerprint = replaceFingerprint.trim();

    if (!name) {
      setErrorMessage("Replacement device name is required.");
      return;
    }
    if (fingerprint.length < 8) {
      setErrorMessage("Replacement fingerprint must be at least 8 characters.");
      return;
    }

    setReplacing(true);
    try {
      const response = await replaceDevice(accessToken, deviceToReplace.deviceId, { name, fingerprint });
      setDeviceId(response.device.deviceId);
      setSuccessMessage(`Device replaced. New device "${response.device.name}" is active and bound.`);
      setDeviceToReplace(null);
      setReplaceName("");
      setReplaceFingerprint("");
      await loadDevices();
    } catch (error: unknown) {
      handleApiError(error, "Device replacement failed.");
    } finally {
      setReplacing(false);
    }
  }

  const currentBoundDeviceId = state.deviceId;
  const boundDevice = devices.find((d) => d.deviceId === currentBoundDeviceId && d.status === "ACTIVE");

  const filteredDevices = devices.filter((d) => {
    if (statusFilter === "ACTIVE") return d.status === "ACTIVE";
    if (statusFilter === "REVOKED") return d.status === "REVOKED";
    return true;
  });

  return (
    <div className="device-management-page">
      {/* Page Header */}
      <div className="section-header">
        <div>
          <p className="eyebrow">Zero Trust Hardware Posture</p>
          <h2>Device Management</h2>
          <p className="muted-text">
            Enroll, bind, and monitor trusted hardware. Every protected resource request validates the hardware context of your active session.
          </p>
        </div>
      </div>

      {/* Zero Trust Explanation Callout */}
      <div className="zero-trust-callout">
        <div className="callout-icon">🔐</div>
        <div>
          <strong>Why is an enrolled device required?</strong>
          <p>
            In Aegis Zero Trust, wallet identity authentication alone does not grant access. Protected corporate
            resources (<code>/employee</code>, <code>/reports</code>, <code>/payroll</code>) require an active registered
            device bound to your session. If no device is bound, requests are rejected with <code>DEVICE_REQUIRED</code>.
            If your device is revoked, requests fail with <code>DEVICE_REVOKED</code>.
          </p>
        </div>
      </div>

      {/* Session Binding Status Banner */}
      <div className={`session-posture-banner ${boundDevice ? "posture-secure" : "posture-warning"}`}>
        <div className="posture-indicator">
          <span className={`status-dot ${boundDevice ? "" : "status-dot-denied"}`} />
          <div>
            <strong>Session Hardware Binding: {boundDevice ? "Bound & Active" : "No Active Device Bound"}</strong>
            <p>
              {boundDevice
                ? `Current session is bound to ${boundDevice.name} (${boundDevice.fingerprint}). Resource access authorized.`
                : "Your session is not currently bound to an active device. Enroll a new device below or bind an existing active device to unlock protected corporate endpoints."}
            </p>
          </div>
        </div>
        {boundDevice && (
          <span className="status-badge" title="Device ID">{boundDevice.deviceId.slice(0, 8)}...</span>
        )}
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="alert-banner alert-success" role="status">
          <span>✓ {successMessage}</span>
          <button type="button" className="alert-close" onClick={() => setSuccessMessage(null)}>×</button>
        </div>
      )}
      {errorMessage && (
        <div className="alert-banner alert-error" role="alert">
          <span>⚠ {errorMessage}</span>
          <button type="button" className="alert-close" onClick={() => setErrorMessage(null)}>×</button>
        </div>
      )}

      <div className="device-grid">
        {/* Enrollment Card */}
        <div className="panel enroll-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Enrollment</p>
              <h3>Enroll New Device</h3>
            </div>
          </div>
          <p className="muted-text">
            Register hardware for your identity. Enrolling automatically binds the device to your active session.
          </p>

          <form onSubmit={(e) => void handleEnroll(e)} className="enroll-form">
            <div className="form-group">
              <label htmlFor="enroll-name">Device Name</label>
              <input
                id="enroll-name"
                type="text"
                placeholder="e.g. Work MacBook Pro, Office Desktop"
                value={enrollName}
                onChange={(e) => setEnrollName(e.target.value)}
                disabled={enrolling}
                required
              />
            </div>

            <div className="form-group">
              <div className="label-row">
                <label htmlFor="enroll-fingerprint">Hardware Fingerprint</label>
                <button
                  type="button"
                  className="quick-action-link"
                  onClick={() => setEnrollFingerprint(generateBrowserFingerprint())}
                >
                  Generate Browser Fingerprint
                </button>
              </div>
              <input
                id="enroll-fingerprint"
                type="text"
                placeholder="min 8 chars (e.g. fp-a8c90f-3e81)"
                value={enrollFingerprint}
                onChange={(e) => setEnrollFingerprint(e.target.value)}
                disabled={enrolling}
                required
              />
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={enrolling}
            >
              {enrolling ? "Enrolling & Binding..." : "Enroll & Bind Device"}
            </button>
          </form>
        </div>

        {/* Device Listing */}
        <div className="panel device-list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Registered Inventory</p>
              <h3>Enrolled Devices ({devices.length})</h3>
            </div>
            <div className="filter-pills" role="tablist">
              <button
                type="button"
                className={`filter-pill ${statusFilter === "ALL" ? "filter-pill-active" : ""}`}
                onClick={() => setStatusFilter("ALL")}
              >
                All ({devices.length})
              </button>
              <button
                type="button"
                className={`filter-pill ${statusFilter === "ACTIVE" ? "filter-pill-active" : ""}`}
                onClick={() => setStatusFilter("ACTIVE")}
              >
                Active ({devices.filter((d) => d.status === "ACTIVE").length})
              </button>
              <button
                type="button"
                className={`filter-pill ${statusFilter === "REVOKED" ? "filter-pill-active" : ""}`}
                onClick={() => setStatusFilter("REVOKED")}
              >
                Revoked ({devices.filter((d) => d.status === "REVOKED").length})
              </button>
            </div>
          </div>

          {loading ? (
            <p className="muted-text">Loading registered devices...</p>
          ) : filteredDevices.length === 0 ? (
            <div className="empty-state">
              <p>No devices found matching the selected filter.</p>
            </div>
          ) : (
            <div className="device-cards">
              {filteredDevices.map((device) => {
                const isCurrent = currentBoundDeviceId === device.deviceId && device.status === "ACTIVE";
                const isBusy = actionInProgressId === device.deviceId;

                return (
                  <div
                    key={device.deviceId}
                    className={`device-card ${device.status === "REVOKED" ? "device-card-revoked" : ""} ${isCurrent ? "device-card-current" : ""}`}
                  >
                    <div className="device-card-header">
                      <div className="device-title-block">
                        <strong>{device.name}</strong>
                        {isCurrent && (
                          <span className="current-badge">BOUND TO CURRENT SESSION</span>
                        )}
                      </div>
                      <span className={`status-badge ${device.status === "ACTIVE" ? "" : "status-badge-muted"}`}>
                        {device.status}
                      </span>
                    </div>

                    <div className="device-meta-grid">
                      <div>
                        <span className="meta-label">Identifier</span>
                        <code className="meta-code" title={device.deviceId}>
                          {device.deviceId.slice(0, 12)}...
                        </code>
                      </div>
                      <div>
                        <span className="meta-label">Fingerprint</span>
                        <code className="meta-code" title={device.fingerprint}>
                          {device.fingerprint}
                        </code>
                      </div>
                      <div>
                        <span className="meta-label">Last Seen</span>
                        <span className="meta-time">
                          {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "Not available"}
                        </span>
                      </div>
                      <div>
                        <span className="meta-label">Enrolled</span>
                        <span className="meta-time">
                          {device.createdAt ? new Date(device.createdAt).toLocaleDateString() : "Not available"}
                        </span>
                      </div>
                    </div>

                    {device.status === "ACTIVE" ? (
                      <div className="device-actions">
                        {!isCurrent && (
                          <button
                            type="button"
                            className="quiet-button action-btn"
                            disabled={isBusy}
                            onClick={() => void handleBind(device)}
                          >
                            Bind to Session
                          </button>
                        )}
                        <button
                          type="button"
                          className="quiet-button action-btn"
                          disabled={isBusy}
                          onClick={() => void handleHeartbeat(device)}
                        >
                          Ping Heartbeat
                        </button>
                        <button
                          type="button"
                          className="quiet-button action-btn"
                          disabled={isBusy}
                          onClick={() => {
                            setDeviceToReplace(device);
                            setReplaceName(`${device.name} (Replaced)`);
                            setReplaceFingerprint(generateBrowserFingerprint());
                          }}
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          className="quiet-button danger-button action-btn"
                          disabled={isBusy}
                          onClick={() => setDeviceToRevoke(device)}
                        >
                          Revoke
                        </button>
                      </div>
                    ) : (
                      <div className="revoked-info">
                        <span>Device permanently revoked. Hardware context permanently untrusted.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Revocation Confirmation Dialog */}
      {deviceToRevoke && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="revoke-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <span className="status-dot status-dot-denied" />
              <h3 id="revoke-modal-title">Confirm Device Revocation</h3>
            </div>

            <p className="modal-warning">
              Are you sure you want to revoke <strong>{deviceToRevoke.name}</strong>?
            </p>

            <div className="consequence-box">
              <strong>Security Consequences:</strong>
              <ul>
                <li>This device will be immediately and permanently marked as <code>REVOKED</code>.</li>
                <li>All active sessions bound to this device will be rejected with <code>DEVICE_REVOKED</code> (403) on future requests.</li>
                <li>This hardware fingerprint will no longer be trusted for Zero Trust access.</li>
                <li>This action <strong>cannot be undone</strong>.</li>
              </ul>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="quiet-button"
                disabled={revoking}
                onClick={() => setDeviceToRevoke(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button danger-button"
                disabled={revoking}
                onClick={() => void confirmRevoke()}
              >
                {revoking ? "Revoking Device..." : "Yes, Revoke Device"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replacement Modal Dialog */}
      {deviceToReplace && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="replace-modal-title">
          <div className="modal-card">
            <div className="modal-header">
              <span className="status-dot" />
              <h3 id="replace-modal-title">Replace Device: {deviceToReplace.name}</h3>
            </div>

            <p className="muted-text">
              Replacing this device will revoke <code>{deviceToReplace.name}</code> and enroll the replacement device, automatically binding it to your active session.
            </p>

            <form onSubmit={(e) => void confirmReplace(e)} className="enroll-form">
              <div className="form-group">
                <label htmlFor="replace-name">New Device Name</label>
                <input
                  id="replace-name"
                  type="text"
                  value={replaceName}
                  onChange={(e) => setReplaceName(e.target.value)}
                  disabled={replacing}
                  required
                />
              </div>

              <div className="form-group">
                <div className="label-row">
                  <label htmlFor="replace-fingerprint">New Hardware Fingerprint</label>
                  <button
                    type="button"
                    className="quick-action-link"
                    onClick={() => setReplaceFingerprint(generateBrowserFingerprint())}
                  >
                    Generate
                  </button>
                </div>
                <input
                  id="replace-fingerprint"
                  type="text"
                  value={replaceFingerprint}
                  onChange={(e) => setReplaceFingerprint(e.target.value)}
                  disabled={replacing}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="quiet-button"
                  disabled={replacing}
                  onClick={() => setDeviceToReplace(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={replacing}
                >
                  {replacing ? "Replacing..." : "Confirm Replacement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

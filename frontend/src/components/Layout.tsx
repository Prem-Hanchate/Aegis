import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthState } from "../context/auth";
import { isTestMode } from "../config/testMode";

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  ["nav-link", isActive ? "nav-link-active" : ""].filter(Boolean).join(" ");

function shortenAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Layout() {
  const navigate = useNavigate();
  const { state, logout, testModeEnabled, setTestModeEnabled } = useAuthState();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-heading">
          <p className="eyebrow">Aegis</p>
          <h1>Zero Trust Access Controller</h1>
        </div>

        <div className="topbar-actions">
          <nav className="nav">
            <div className="nav-group">
              <span className="nav-group-label">Overview</span>
              <NavLink to="/" className={navLinkClassName}>Dashboard</NavLink>
            </div>
            <div className="nav-group">
              <span className="nav-group-label">My security</span>
              <NavLink to="/devices" className={navLinkClassName}>My devices</NavLink>
            </div>
            {state.permissions.some((permission) => ["employee:read", "reports:read", "payroll:read"].includes(permission)) ? (
              <div className="nav-group">
                <span className="nav-group-label">Access</span>
                {state.permissions.includes("employee:read") ? <NavLink to="/resources/employee" className={navLinkClassName}>Employee</NavLink> : null}
                {state.permissions.includes("reports:read") ? <NavLink to="/resources/reports" className={navLinkClassName}>Reports</NavLink> : null}
                {state.permissions.includes("payroll:read") ? <NavLink to="/resources/payroll" className={navLinkClassName}>Payroll</NavLink> : null}
              </div>
            ) : null}
            {state.permissions.includes("policies:manage") ? (
              <div className="nav-group">
                <span className="nav-group-label">Administration</span>
                <NavLink to="/identities" className={navLinkClassName}>
                  Identity management
                </NavLink>
                <NavLink to="/policies" className={navLinkClassName}>
                  Roles &amp; permissions
                </NavLink>
                <NavLink to="/control-center" className={navLinkClassName}>
                  Control center
                </NavLink>
              </div>
            ) : null}
            <div className="nav-group">
              <span className="nav-group-label">Monitoring</span>
              <NavLink to="/health" className={navLinkClassName}>System health</NavLink>
            </div>
          </nav>

          {state.identity && state.session ? (
            <div className="user-nav-card">
              <span className="status-dot" title="Active authenticated session" />
              <div className="user-details">
                <strong className="user-name">{state.identity.displayName}</strong>
                <span className="user-wallet" title={state.identity.walletAddress}>
                  {shortenAddress(state.identity.walletAddress)}
                </span>
              </div>
              <button
                className="quiet-button logout-button"
                type="button"
                onClick={() => void handleLogout()}
                aria-label="Sign out"
              >
                Sign out
              </button>
            </div>
          ) : (
            <NavLink to="/login" className="button-link">
              Sign in
            </NavLink>
          )}
          {isTestMode ? (
            <button
              className={`test-mode-toggle ${testModeEnabled ? "test-mode-toggle-active" : ""}`}
              type="button"
              role="switch"
              aria-checked={testModeEnabled}
              onClick={() => setTestModeEnabled(!testModeEnabled)}
              title={testModeEnabled ? "Disable development test mode" : "Enable development test mode"}
            >
              <span className="test-mode-toggle-track"><span /></span>
              <span>Test mode</span>
            </button>
          ) : null}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

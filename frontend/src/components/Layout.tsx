import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthState } from "../context/auth";

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  ["nav-link", isActive ? "nav-link-active" : ""].filter(Boolean).join(" ");

function shortenAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Layout() {
  const navigate = useNavigate();
  const { state, logout } = useAuthState();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Aegis</p>
          <h1>Zero Trust Access Controller</h1>
        </div>

        <div className="topbar-actions">
          <nav className="nav">
            <NavLink to="/" className={navLinkClassName}>
              Dashboard
            </NavLink>
            <NavLink to="/devices" className={navLinkClassName}>
              Devices
            </NavLink>
            {state.permissions.includes("policies:manage") ? (
              <>
                <NavLink to="/identities" className={navLinkClassName}>
                  Identities
                </NavLink>
                <NavLink to="/policies" className={navLinkClassName}>
                  Policies
                </NavLink>
                <NavLink to="/control-center" className={navLinkClassName}>
                  Control center
                </NavLink>
                <NavLink to="/audit" className={navLinkClassName}>
                  Audit
                </NavLink>
              </>
            ) : null}
            {state.permissions.includes("employee:read") ? (
              <NavLink to="/resources/employee" className={navLinkClassName}>Employee</NavLink>
            ) : null}
            {state.permissions.includes("reports:read") ? (
              <NavLink to="/resources/reports" className={navLinkClassName}>Reports</NavLink>
            ) : null}
            {state.permissions.includes("payroll:read") ? (
              <NavLink to="/resources/payroll" className={navLinkClassName}>Payroll</NavLink>
            ) : null}
            <NavLink to="/health" className={navLinkClassName}>
              Health
            </NavLink>
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
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

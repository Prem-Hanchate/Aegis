import { NavLink, Outlet } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { logout } from "../services/auth";
import { useAuthState } from "../context/auth";

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  ["nav-link", isActive ? "nav-link-active" : ""].filter(Boolean).join(" ");

export function Layout() {
  const navigate = useNavigate();
  const { state, setState } = useAuthState();

  async function handleLogout() {
    if (state.session) {
      await logout(state.session.accessToken).catch(() => undefined);
    }
    setState({ status: "anonymous", identity: null, session: null, deviceId: null, roles: [], permissions: [], errorMessage: null });
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Aegis</p>
          <h1>Decentralized Identity & Zero Trust Access Controller</h1>
        </div>
        <div className="topbar-actions">
          <nav className="nav">
            <NavLink to="/" className={navLinkClassName}>Dashboard</NavLink>
            <NavLink to="/control-center" className={navLinkClassName}>Control center</NavLink>
            <NavLink to="/health" className={navLinkClassName}>Health</NavLink>
          </nav>
          <button className="quiet-button" type="button" onClick={() => void handleLogout()}>Sign out</button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

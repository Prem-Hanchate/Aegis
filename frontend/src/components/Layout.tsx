import { NavLink, Outlet } from "react-router-dom";

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  ["nav-link", isActive ? "nav-link-active" : ""].filter(Boolean).join(" ");

export function Layout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Aegis</p>
          <h1>Decentralized Identity & Zero Trust Access Controller</h1>
        </div>
        <nav className="nav">
          <NavLink to="/" className={navLinkClassName}>
            Dashboard
          </NavLink>
          <NavLink to="/health" className={navLinkClassName}>
            Health
          </NavLink>
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

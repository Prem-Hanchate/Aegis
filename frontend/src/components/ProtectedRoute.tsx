import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthState } from "../context/auth";
import { isTestMode } from "../config/testMode";

export function ProtectedRoute() {
  const { state, testModeEnabled } = useAuthState();
  const location = useLocation();
  const enforceAuth = !isTestMode || !testModeEnabled;

  if (enforceAuth && state.status === "loading") {
    return <p className="muted-text">Restoring your authenticated session...</p>;
  }

  if (enforceAuth && (state.status !== "authenticated" || !state.session)) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthState } from "../context/auth";

export function ProtectedRoute() {
  const { state } = useAuthState();
  const location = useLocation();

  if (state.status === "loading") {
    return <p className="muted-text">Restoring your authenticated session...</p>;
  }

  if (state.status !== "authenticated" || !state.session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

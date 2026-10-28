import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "../components/Layout";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { ControlCenterPage } from "../pages/ControlCenterPage";
import { DashboardPage } from "../pages/DashboardPage";
import { DeviceManagementPage } from "../pages/DeviceManagementPage";
import { HealthPage } from "../pages/HealthPage";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ResourcePage } from "../pages/ResourcePage";
import { IdentityAdministrationPage } from "../pages/IdentityAdministrationPage";
import { PolicyManagementPage } from "../pages/PolicyManagementPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Layout />}>
          <Route path="/health" element={<HealthPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/devices" element={<DeviceManagementPage />} />
            <Route path="/control-center" element={<ControlCenterPage />} />
            <Route path="/identities" element={<IdentityAdministrationPage />} />
            <Route path="/policies" element={<PolicyManagementPage />} />
            <Route path="/resources/:resource" element={<ResourcePage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

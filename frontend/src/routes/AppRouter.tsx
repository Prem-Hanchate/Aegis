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
            <Route path="/resources/:resource" element={<ResourcePage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

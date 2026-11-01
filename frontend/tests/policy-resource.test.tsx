import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthStateProvider, useAuthState } from "../src/context/auth";
import { PolicyManagementPage } from "../src/pages/PolicyManagementPage";
import { ResourcePage } from "../src/pages/ResourcePage";
import { ApiError } from "../src/services/auth";
import { fetchPolicies, fetchResource, grantPolicy, revokePolicy } from "../src/services/api";

vi.mock("../src/services/api", () => ({
  fetchPolicies: vi.fn(),
  fetchResource: vi.fn(),
  grantPolicy: vi.fn(),
  revokePolicy: vi.fn(),
}));

const adminPermissions = ["policies:manage"];

function AuthenticatedPage({ children, permissions = adminPermissions }: { children: React.ReactNode; permissions?: string[] }) {
  const { setSession } = useAuthState();
  useEffect(() => {
    setSession(
      { identityId: "identity-1", walletAddress: "0x1111111111111111111111111111111111111111", displayName: "Admin" },
      { sessionId: "session", accessToken: "token", expiresAt: "2026-12-01T00:00:00.000Z" },
      ["admin"],
      "device-1",
      permissions,
    );
  }, [permissions, setSession]);
  return children;
}

describe("policy management and protected resources", () => {
  beforeEach(() => {
    vi.mocked(fetchPolicies).mockResolvedValue({
      policies: {
        employee: ["employee:read", "reports:read"],
        manager: ["employee:read", "reports:read", "payroll:read"],
        admin: ["employee:read", "reports:read", "payroll:read", "policies:manage"],
      },
    });
    vi.mocked(grantPolicy).mockResolvedValue({ policy: { role: "employee", permissions: ["employee:read", "payroll:read"] } });
    vi.mocked(revokePolicy).mockResolvedValue({ policy: { role: "employee", permissions: ["employee:read"] } });
  });

  it("shows live policies and requires confirmation before revocation", async () => {
    const user = userEvent.setup();
    render(<AuthStateProvider><AuthenticatedPage><PolicyManagementPage /></AuthenticatedPage></AuthStateProvider>);

    expect(await screen.findByText("Roles and permissions")).toBeInTheDocument();
    expect(screen.getByText("policies:manage")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Grant permission" }));
    await waitFor(() => expect(grantPolicy).toHaveBeenCalledWith("token", { role: "employee", resource: "employee", action: "read" }));
    expect(await screen.findByRole("status")).toHaveTextContent("granted");
    await user.click(screen.getByRole("button", { name: "Revoke permission" }));
    expect(screen.getByRole("button", { name: "Confirm revoke" })).toBeInTheDocument();
    expect(revokePolicy).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(revokePolicy).toHaveBeenCalledWith("token", "employee", { resource: "employee", action: "read" }));
    expect(await screen.findByRole("status")).toHaveTextContent("revoked");
  });

  it("distinguishes a forbidden resource response", async () => {
    vi.mocked(fetchResource).mockRejectedValue(new ApiError("Access denied.", 403, "AUTHORIZATION_DENIED"));
    render(
      <AuthStateProvider>
        <AuthenticatedPage permissions={["employee:read"]}>
          <MemoryRouter initialEntries={["/resources/payroll"]}>
            <Routes><Route path="/resources/:resource" element={<ResourcePage />} /></Routes>
          </MemoryRouter>
        </AuthenticatedPage>
      </AuthStateProvider>,
    );

    expect(await screen.findByText("Access denied by policy")).toBeInTheDocument();
    expect(screen.getByText(/backend denied this resource/)).toBeInTheDocument();
  });

  it("shows network failures separately from authorization failures", async () => {
    vi.mocked(fetchResource).mockRejectedValue(new Error("Network unavailable"));
    render(
      <AuthStateProvider>
        <AuthenticatedPage permissions={["employee:read"]}>
          <MemoryRouter initialEntries={["/resources/employee"]}>
            <Routes><Route path="/resources/:resource" element={<ResourcePage />} /></Routes>
          </MemoryRouter>
        </AuthenticatedPage>
      </AuthStateProvider>,
    );

    expect(await screen.findByText("Resource unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Check the network connection/)).toBeInTheDocument();
  });
});

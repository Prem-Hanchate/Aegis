import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthStateProvider, useAuthState } from "../src/context/auth";
import { AuditPage } from "../src/pages/AuditPage";
import { ApiError } from "../src/services/auth";
import { fetchAudit, fetchAuditSummary } from "../src/services/api";

vi.mock("../src/services/api", () => ({
  fetchAudit: vi.fn(),
  fetchAuditSummary: vi.fn(),
}));

const adminPermissions = ["policies:manage"];

function AuthenticatedPage({ permissions = adminPermissions }: { permissions?: string[] }) {
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
  return <MemoryRouter><AuditPage /></MemoryRouter>;
}

const event = {
  eventId: "event-1",
  timestamp: "2026-10-29T12:00:00.000Z",
  eventType: "ACCESS_DECISION",
  identityId: "identity-1",
  resource: "reports",
  action: "read",
  outcome: "DENIED",
  reason: "No active role grants this permission.",
  actor: "0xactor",
};

describe("audit dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAudit).mockResolvedValue({ total: 11, events: [event] });
    vi.mocked(fetchAuditSummary).mockResolvedValue({
      summary: { total: 11, byOutcome: { ALLOWED: 5, DENIED: 2, FAILURE: 1, SUCCESS: 3 }, byEventType: {} },
    });
  });

  it("loads the real audit filters and resets pagination when a filter changes", async () => {
    const user = userEvent.setup();
    render(<AuthStateProvider><AuthenticatedPage /></AuthStateProvider>);

    expect(await screen.findByText("Recorded security events")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "! Denied" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchAudit).toHaveBeenLastCalledWith("token", expect.objectContaining({ offset: 10, limit: 10 })));
    await user.type(screen.getByLabelText("Audit identity"), "identity-1");
    await waitFor(() => expect(fetchAudit).toHaveBeenLastCalledWith("token", expect.objectContaining({ identityId: "identity-1", offset: 0, limit: 10 })));
  });

  it("shows loading errors and backend validation failures", async () => {
    vi.mocked(fetchAudit).mockRejectedValue(new ApiError("Request validation failed.", 400, "VALIDATION_ERROR"));
    render(<AuthStateProvider><AuthenticatedPage /></AuthStateProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("filters are invalid");
  });

  it("does not expose the dashboard to identities without the backend permission", async () => {
    render(<AuthStateProvider><AuthenticatedPage permissions={["employee:read"]} /></AuthStateProvider>);
    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(fetchAudit).not.toHaveBeenCalled();
  });

  it("explains how to generate real activity when the audit store is empty", async () => {
    vi.mocked(fetchAudit).mockResolvedValue({ total: 0, events: [] });
    vi.mocked(fetchAuditSummary).mockResolvedValue({
      summary: { total: 0, byOutcome: {}, byEventType: {} },
    });
    render(<AuthStateProvider><AuthenticatedPage /></AuthStateProvider>);
    expect(await screen.findByText("Audit collection is ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open control center" })).toHaveAttribute("href", "/control-center");
  });
});

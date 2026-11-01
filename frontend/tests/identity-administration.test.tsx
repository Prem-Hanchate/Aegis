import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { AuthStateProvider, useAuthState } from "../src/context/auth";
import { IdentityAdministrationPage } from "../src/pages/IdentityAdministrationPage";
import {
  assignIdentityRole,
  fetchIdentities,
  registerIdentity,
  updateIdentityProfile,
  updateIdentityStatus,
} from "../src/services/api";

vi.mock("../src/services/api", () => ({
  assignIdentityRole: vi.fn(),
  fetchIdentities: vi.fn(),
  removeIdentityRole: vi.fn(),
  registerIdentity: vi.fn(),
  updateIdentityProfile: vi.fn(),
  updateIdentityStatus: vi.fn(),
}));

const identities = [
  {
    identityId: "identity-1",
    walletAddress: "0x1111111111111111111111111111111111111111",
    displayName: "Alice Admin",
    status: "ACTIVE" as const,
    roles: ["admin"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    identityId: "identity-2",
    walletAddress: "0x2222222222222222222222222222222222222222",
    displayName: "Bob User",
    status: "REVOKED" as const,
    roles: ["employee"],
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

function AuthenticatedPage() {
  const { setSession } = useAuthState();
  useEffect(() => {
    setSession(
      { identityId: "admin", walletAddress: identities[0].walletAddress, displayName: "Alice Admin" },
      { sessionId: "session", accessToken: "token", expiresAt: "2026-12-01T00:00:00.000Z" },
      ["admin"],
      null,
      ["policies:manage"],
    );
  }, [setSession]);
  return <IdentityAdministrationPage />;
}

describe("identity administration page", () => {
  beforeEach(() => {
    vi.mocked(fetchIdentities).mockResolvedValue({ identities });
    vi.mocked(registerIdentity).mockResolvedValue({ identity: identities[1] });
    vi.mocked(updateIdentityProfile).mockResolvedValue({ identity: { ...identities[0], displayName: "Updated Alice" } });
    vi.mocked(updateIdentityStatus).mockResolvedValue({ identity: identities[0] });
    vi.mocked(assignIdentityRole).mockResolvedValue({ identity: identities[0] });
  });

  it("lists identities, filters by search, and shows details", async () => {
    render(
      <AuthStateProvider>
        <AuthenticatedPage />
      </AuthStateProvider>,
    );

    expect((await screen.findAllByText("Alice Admin")).length).toBeGreaterThan(0);
    expect(screen.getByText("Bob User")).toBeInTheDocument();
    expect(screen.getAllByText(identities[0].walletAddress).length).toBeGreaterThan(0);

    await userEvent.type(screen.getByRole("textbox", { name: "Search identities" }), "Bob");
    expect(screen.queryAllByRole("button", { name: /Alice Admin/ })).toHaveLength(0);
    expect(screen.getByText("Bob User")).toBeInTheDocument();
  });

  it("validates registration and refreshes after a successful mutation", async () => {
    const user = userEvent.setup();
    render(
      <AuthStateProvider>
        <AuthenticatedPage />
      </AuthStateProvider>,
    );

    await screen.findAllByText("Alice Admin");
    await user.type(screen.getByRole("textbox", { name: "Identity display name" }), "New Identity");
    await user.type(screen.getByRole("textbox", { name: "Identity wallet address" }), "not-a-wallet");
    await user.click(screen.getByRole("button", { name: "Register identity" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("valid Ethereum wallet");
    expect(registerIdentity).not.toHaveBeenCalled();

    const walletInput = screen.getByRole("textbox", { name: "Identity wallet address" });
    await user.clear(walletInput);
    await user.type(walletInput, "0x3333333333333333333333333333333333333333");
    await user.click(screen.getByRole("button", { name: "Register identity" }));
    await waitFor(() => expect(registerIdentity).toHaveBeenCalled());
    expect(await screen.findByRole("status")).toHaveTextContent("registered successfully");
    expect(fetchIdentities).toHaveBeenCalledTimes(3);
  });
});

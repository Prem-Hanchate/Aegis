import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { fetchResource, requestProtectedJson } from "../src/services/api";
import type { EthereumProvider } from "../src/types/ethereum";

const mockWallet = "0x1111111111111111111111111111111111111111";
const mockSignature = "0xabcdef1234567890";
const mockAccessToken = "mock-access-token-1234567890abcdef";

const mockChallengeResponse = {
  challenge: {
    nonce: "mock-nonce-123",
    walletAddress: mockWallet,
    domain: "aegis.zerotrust.local",
    message: "Aegis Zero Trust Authentication\nDomain: aegis.zerotrust.local\nNonce: mock-nonce-123",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    purpose: "Zero Trust IAM",
  },
};

const mockVerifyResponse = {
  status: "authenticated",
  result: {
    walletAddress: mockWallet,
    nonce: "mock-nonce-123",
    domain: "aegis.zerotrust.local",
    identity: {
      identityId: "identity-uuid-1",
      walletAddress: mockWallet,
      displayName: "Alice Operator",
      status: "ACTIVE" as const,
      roles: ["employee", "manager"],
    },
    session: {
      sessionId: "session-uuid-1",
      accessToken: mockAccessToken,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    },
  },
};

const mockHealthResponse = {
  status: "ok",
  service: "aegis-backend",
  environment: "test",
  timestamp: new Date().toISOString(),
  database: { connected: true, readyState: 1, name: "identity_security_db" },
};

function setupMockEthereum(overrides: Partial<EthereumProvider> = {}): EthereumProvider {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const mockProvider: EthereumProvider = {
    isMetaMask: true,
    request: vi.fn().mockImplementation(async ({ method }) => {
      if (method === "eth_requestAccounts") {
        return [mockWallet];
      }
      if (method === "personal_sign") {
        return mockSignature;
      }
      return null;
    }),
    on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    }),
    removeListener: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    }),
    ...overrides,
  };

  (window as unknown as { ethereum: EthereumProvider }).ethereum = mockProvider;
  return mockProvider;
}

describe("MetaMask Challenge-Response Authentication Workflows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (window as unknown as { ethereum?: unknown }).ethereum;
    vi.unstubAllGlobals();
  });

  it("completes full challenge, signature, and verification login flow", async () => {
    const ethereum = setupMockEthereum();

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/auth/challenge")) {
        return {
          ok: true,
          status: 201,
          json: async () => mockChallengeResponse,
        };
      }
      if (url.includes("/api/auth/verify")) {
        return {
          ok: true,
          status: 200,
          json: async () => mockVerifyResponse,
        };
      }
      if (url.includes("/api/health")) {
        return {
          ok: true,
          status: 200,
          json: async () => mockHealthResponse,
        };
      }
      if (url.includes("/api/devices")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ devices: [] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    // Click "Connect Wallet & Sign In"
    const signInButton = screen.getByRole("button", { name: /Connect Wallet & Sign In/i });
    expect(signInButton).toBeInTheDocument();

    await userEvent.click(signInButton);

    // Verify Ethereum calls
    await waitFor(() => {
      expect(ethereum.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
      expect(ethereum.request).toHaveBeenCalledWith({
        method: "personal_sign",
        params: [mockChallengeResponse.challenge.message, mockWallet],
      });
    });

    // Verify Backend calls
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/challenge"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ walletAddress: mockWallet }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/verify"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          walletAddress: mockWallet,
          message: mockChallengeResponse.challenge.message,
          signature: mockSignature,
        }),
      }),
    );

    // After login, Dashboard is rendered with operator identity
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Alice Operator/i })).toBeInTheDocument();
      expect(screen.getByText(/Zero Trust Identity Profile/i)).toBeInTheDocument();
      expect(screen.getByText(/Active \(Bearer\)/i)).toBeInTheDocument();
      expect(screen.getByText("employee")).toBeInTheDocument();
      expect(screen.getByText("manager")).toBeInTheDocument();
    });
  });

  it("handles user rejecting the signature request in MetaMask (code 4001)", async () => {
    setupMockEthereum({
      request: vi.fn().mockImplementation(async ({ method }) => {
        if (method === "eth_requestAccounts") {
          return [mockWallet];
        }
        if (method === "personal_sign") {
          const rejection = new Error("User denied message signature.");
          (rejection as unknown as { code: number }).code = 4001;
          throw rejection;
        }
        return null;
      }),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/api/auth/challenge")) {
          return { ok: true, status: 201, json: async () => mockChallengeResponse };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );

    render(<App />);

    const signInButton = screen.getByRole("button", { name: /Connect Wallet & Sign In/i });
    await userEvent.click(signInButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Signature request was rejected in MetaMask/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Retry Authentication/i })).toBeInTheDocument();
    });
  });

  it("handles backend verification error for unregistered identity", async () => {
    setupMockEthereum();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/api/auth/challenge")) {
          return { ok: true, status: 201, json: async () => mockChallengeResponse };
        }
        if (url.includes("/api/auth/verify")) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              error: {
                code: "AUTH_IDENTITY_NOT_FOUND",
                message: "No identity is registered for this wallet.",
              },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );

    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /Connect Wallet & Sign In/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/No identity is registered for this wallet/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Retry Authentication/i })).toBeInTheDocument();
    });
  });

  it("handles backend verification error for revoked identity", async () => {
    setupMockEthereum();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/api/auth/challenge")) {
          return { ok: true, status: 201, json: async () => mockChallengeResponse };
        }
        if (url.includes("/api/auth/verify")) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              error: {
                code: "AUTH_IDENTITY_REVOKED",
                message: "The identity is revoked.",
              },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );

    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /Connect Wallet & Sign In/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/This identity has been revoked. Zero Trust access is denied./i),
      ).toBeInTheDocument();
    });
  });

  it("handles backend network failure during challenge request", async () => {
    setupMockEthereum();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Failed to fetch")),
    );

    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: /Connect Wallet & Sign In/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Retry Authentication/i })).toBeInTheDocument();
    });
  });

  it("logs out, revokes session on backend, and clears in-memory auth state", async () => {
    setupMockEthereum();

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/auth/challenge")) {
        return { ok: true, status: 201, json: async () => mockChallengeResponse };
      }
      if (url.includes("/api/auth/verify")) {
        return { ok: true, status: 200, json: async () => mockVerifyResponse };
      }
      if (url.includes("/api/auth/logout")) {
        return { ok: true, status: 204, json: async () => ({}) };
      }
      if (url.includes("/api/health")) {
        return { ok: true, status: 200, json: async () => mockHealthResponse };
      }
      if (url.includes("/api/devices")) {
        return { ok: true, status: 200, json: async () => ({ devices: [] }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    // Authenticate
    await userEvent.click(screen.getByRole("button", { name: /Connect Wallet & Sign In/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Alice Operator/i })).toBeInTheDocument();
    });

    // Sign out
    const signOutButton = screen.getByRole("button", { name: /Sign out/i });
    await userEvent.click(signOutButton);

    // Verify backend logout was invoked with bearer token
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/logout"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockAccessToken}`,
          }),
        }),
      );
    });

    // Should be redirected to the login gateway
    await waitFor(() => {
      expect(screen.getByText(/Wallet Authentication/i)).toBeInTheDocument();
    });
  });

  it("attaches bearer token in centralized API client and handles resource responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ resource: "employee", data: "Employee Directory Records" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchResource(mockAccessToken, "employee");

    expect(result.data).toBe("Employee Directory Records");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/resources/employee"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${mockAccessToken}`,
        }),
      }),
    );
  });

  it("handles account switching in MetaMask by clearing session to prevent wallet mismatch", async () => {
    let capturedHandler: ((accounts: string[]) => void) | undefined;

    setupMockEthereum({
      on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (event === "accountsChanged") {
          capturedHandler = handler as (accounts: string[]) => void;
        }
      }),
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/auth/challenge")) {
        return { ok: true, status: 201, json: async () => mockChallengeResponse };
      }
      if (url.includes("/api/auth/verify")) {
        return { ok: true, status: 200, json: async () => mockVerifyResponse };
      }
      if (url.includes("/api/health")) {
        return { ok: true, status: 200, json: async () => mockHealthResponse };
      }
      if (url.includes("/api/devices")) {
        return { ok: true, status: 200, json: async () => ({ devices: [] }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    // Log in
    await userEvent.click(screen.getByRole("button", { name: /Connect Wallet & Sign In/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Alice Operator/i })).toBeInTheDocument();
    });

    // Simulate MetaMask user switching to a different account
    expect(capturedHandler).toBeDefined();
    act(() => {
      capturedHandler!(["0x2222222222222222222222222222222222222222"]);
    });

    // Should clear session and prompt re-authentication
    await waitFor(() => {
      expect(screen.getByText(/Wallet account changed. Please re-authenticate/i)).toBeInTheDocument();
      expect(screen.getByText(/Wallet Authentication/i)).toBeInTheDocument();
    });
  });
});


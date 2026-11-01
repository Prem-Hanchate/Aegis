import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { fetchCurrentSession, logout as apiLogout } from "../services/auth";
import { createTestModeSession, isTestMode } from "../config/testMode";

export type AuthStatus = "anonymous" | "loading" | "authenticated" | "error";

export interface AuthIdentity {
  identityId: string;
  walletAddress: string;
  displayName: string;
  status?: "ACTIVE" | "REVOKED";
  permissions?: string[];
}

export interface AuthSession {
  sessionId: string;
  accessToken: string;
  expiresAt: string;
}

export interface AuthState {
  status: AuthStatus;
  identity: AuthIdentity | null;
  session: AuthSession | null;
  deviceId: string | null;
  roles: string[];
  permissions: string[];
  errorMessage: string | null;
}

interface AuthContextValue {
  state: AuthState;
  setState: Dispatch<SetStateAction<AuthState>>;
  setSession: (
    identity: AuthIdentity,
    session: AuthSession,
    roles?: string[],
    deviceId?: string | null,
    permissions?: string[],
  ) => void;
  setDeviceId: (deviceId: string | null) => void;
  clearSession: (errorMessage?: string | null) => void;
  setError: (errorMessage: string) => void;
  setLoading: (loading: boolean) => void;
  testModeEnabled: boolean;
  setTestModeEnabled: (enabled: boolean) => void;
  logout: () => Promise<void>;
}

const initialAuthState: AuthState = {
  status: "anonymous",
  identity: null,
  session: null,
  deviceId: null,
  roles: [],
  permissions: [],
  errorMessage: null,
};

const AUTH_STORAGE_KEY = "aegis.auth.session";

interface StoredAuthState {
  identity: AuthIdentity;
  session: AuthSession;
  roles: string[];
  permissions: string[];
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window === "undefined") return initialAuthState;
    return sessionStorage.getItem(AUTH_STORAGE_KEY) ? { ...initialAuthState, status: "loading" } : initialAuthState;
  });
  const [testModeEnabled, setTestModeEnabledState] = useState(isTestMode);

  useEffect(() => {
    if (isTestMode && testModeEnabled) setState(createTestModeSession());
  }, []);

  useEffect(() => {
    if (isTestMode || import.meta.env.MODE === "test" || typeof window === "undefined") return;

    const stored = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return;

    let cancelled = false;
    async function restoreSession() {
      try {
        const parsed = JSON.parse(stored as string) as StoredAuthState;
        if (!parsed.session?.accessToken || new Date(parsed.session.expiresAt) <= new Date()) {
          throw new Error("Stored session expired.");
        }

        const current = await fetchCurrentSession(parsed.session.accessToken);
        if (cancelled) return;

        const identity = current.identity;
        const roles = current.session.roles ?? identity.roles ?? parsed.roles;
        const permissions = identity.permissions ?? parsed.permissions;
        const session: AuthSession = {
          sessionId: current.session.sessionId,
          accessToken: parsed.session.accessToken,
          expiresAt: current.session.expiresAt ?? parsed.session.expiresAt,
        };
        setState({
          status: "authenticated",
          identity,
          session,
          deviceId: current.session.deviceId ?? null,
          roles,
          permissions,
          errorMessage: null,
        });
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ identity, session, roles, permissions }));
      } catch {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
        if (!cancelled) setState(initialAuthState);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTestModeEnabled = useCallback((enabled: boolean) => {
    if (!isTestMode) return;
    setTestModeEnabledState(enabled);
    setState(enabled ? createTestModeSession() : initialAuthState);
  }, []);

  const setSession = useCallback(
    (
      identity: AuthIdentity,
      session: AuthSession,
      roles: string[] = [],
      deviceId: string | null = null,
      permissions: string[] = [],
    ) => {
      setState({
        status: "authenticated",
        identity,
        session,
        deviceId,
        roles,
        permissions,
        errorMessage: null,
      });
      if (typeof window !== "undefined") {
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ identity, session, roles, permissions }));
      }
    },
    [],
  );

  const clearSession = useCallback((errorMessage: string | null = null) => {
    if (typeof window !== "undefined") sessionStorage.removeItem(AUTH_STORAGE_KEY);
    setState({
      status: errorMessage ? "error" : "anonymous",
      identity: null,
      session: null,
      deviceId: null,
      roles: [],
      permissions: [],
      errorMessage,
    });
  }, []);

  const setError = useCallback((errorMessage: string) => {
    setState((current) => ({
      ...current,
      status: "error",
      errorMessage,
    }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState((current) => ({
      ...current,
      status: loading ? "loading" : current.session ? "authenticated" : "anonymous",
    }));
  }, []);

  const logout = useCallback(async () => {
    if (state.session?.accessToken) {
      try {
        await apiLogout(state.session.accessToken);
      } catch {
        // Backend revocation error should not block client logout
      }
    }
    clearSession();
  }, [state.session, clearSession]);

  // Monitor MetaMask account changes to avoid silent wallet hijacking
  useEffect(() => {
    const ethereum = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!ethereum || typeof ethereum.on !== "function") return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accountList = Array.isArray(accounts) ? (accounts as string[]) : [];
      if (accountList.length === 0) {
        if (state.status === "authenticated") {
          clearSession("MetaMask account disconnected.");
        }
      } else if (
        state.identity?.walletAddress &&
        accountList[0]?.toLowerCase() !== state.identity.walletAddress.toLowerCase()
      ) {
        clearSession("Wallet account changed. Please re-authenticate with the active wallet.");
      }
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, [state.status, state.identity?.walletAddress, clearSession]);

  const setDeviceId = useCallback((deviceId: string | null) => {
    setState((current) => ({
      ...current,
      deviceId,
    }));
  }, []);

  const value = useMemo(
    () => ({
      state,
      setState,
      setSession,
      setDeviceId,
      clearSession,
      setError,
      setLoading,
      testModeEnabled,
      setTestModeEnabled,
      logout,
    }),
    [state, setSession, setDeviceId, clearSession, setError, setLoading, testModeEnabled, setTestModeEnabled, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthState(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthState must be used within an AuthStateProvider");
  }

  return context;
}

export function createInitialAuthState(): AuthState {
  return { ...initialAuthState };
}
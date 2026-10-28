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
import { logout as apiLogout } from "../services/auth";

export type AuthStatus = "anonymous" | "loading" | "authenticated" | "error";

export interface AuthIdentity {
  identityId: string;
  walletAddress: string;
  displayName: string;
  status?: "ACTIVE" | "REVOKED";
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
  ) => void;
  setDeviceId: (deviceId: string | null) => void;
  clearSession: (errorMessage?: string | null) => void;
  setError: (errorMessage: string) => void;
  setLoading: (loading: boolean) => void;
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

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthStateProvider({ children }: { children: ReactNode }) {
  // In-memory authentication state (no insecure bearer token persistence in localStorage)
  const [state, setState] = useState<AuthState>(initialAuthState);


  const setSession = useCallback(
    (
      identity: AuthIdentity,
      session: AuthSession,
      roles: string[] = [],
      deviceId: string | null = null,
    ) => {
      setState({
        status: "authenticated",
        identity,
        session,
        deviceId,
        roles,
        permissions: [],
        errorMessage: null,
      });
    },
    [],
  );

  const clearSession = useCallback((errorMessage: string | null = null) => {
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
      logout,
    }),
    [state, setSession, setDeviceId, clearSession, setError, setLoading, logout],
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
import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export type AuthStatus = "anonymous" | "loading" | "authenticated" | "error";

export interface AuthIdentity {
  identityId: string;
  walletAddress: string;
  displayName: string;
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

interface AuthStateContextValue {
  state: AuthState;
  setState: Dispatch<SetStateAction<AuthState>>;
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

const authStorageKey = "aegis.auth.session";

const AuthStateContext = createContext<AuthStateContextValue | null>(null);

export function AuthStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const stored = window.localStorage.getItem(authStorageKey);
      return stored ? (JSON.parse(stored) as AuthState) : initialAuthState;
    } catch {
      return initialAuthState;
    }
  });

  const updateState: Dispatch<SetStateAction<AuthState>> = (nextState) => {
    setState((currentState) => {
      const resolvedState = typeof nextState === "function" ? nextState(currentState) : nextState;
      if (resolvedState.status === "authenticated" && resolvedState.session) {
        window.localStorage.setItem(authStorageKey, JSON.stringify(resolvedState));
      } else {
        window.localStorage.removeItem(authStorageKey);
      }
      return resolvedState;
    });
  };
  const value = useMemo(() => ({ state, setState: updateState }), [state]);

  return <AuthStateContext.Provider value={value}>{children}</AuthStateContext.Provider>;
}

export function useAuthState() {
  const context = useContext(AuthStateContext);
  if (!context) {
    throw new Error("useAuthState must be used within an AuthStateProvider");
  }

  return context;
}

export function createInitialAuthState() {
  return { ...initialAuthState };
}
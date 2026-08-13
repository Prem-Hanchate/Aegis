import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export type AuthStatus = "anonymous" | "loading" | "authenticated" | "error";

export interface AuthIdentity {
  identityId: string;
  walletAddress: string;
  displayName: string;
}

export interface AuthSession {
  sessionId: string;
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

const AuthStateContext = createContext<AuthStateContextValue | null>(null);

export function AuthStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialAuthState);
  const value = useMemo(() => ({ state, setState }), [state]);

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
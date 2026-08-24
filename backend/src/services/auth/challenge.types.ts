export interface LoginChallenge {
  nonce: string;
  walletAddress: string;
  domain: string;
  message: string;
  issuedAt: string;
  expiresAt: string;
  purpose: string;
  used: boolean;
  usedAt: string | null;
}

export interface IssuedLoginChallenge {
  nonce: string;
  walletAddress: string;
  domain: string;
  message: string;
  issuedAt: string;
  expiresAt: string;
  purpose: string;
}

export interface AuthVerificationResult {
  walletAddress: string;
  nonce: string;
  domain: string;
  identity: {
    identityId: string;
    displayName: string;
    status: "ACTIVE" | "REVOKED";
    roles: string[];
  };
  session: {
    sessionId: string;
    accessToken: string;
    expiresAt: string;
  };
}
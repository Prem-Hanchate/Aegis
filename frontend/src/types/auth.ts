export interface AuthChallenge {
  nonce: string;
  walletAddress: string;
  domain: string;
  message: string;
  issuedAt: string;
  expiresAt: string;
  purpose: string;
}

export interface AuthChallengeResponse {
  challenge: AuthChallenge;
}

export interface AuthIdentityRecord {
  identityId: string;
  walletAddress: string;
  displayName: string;
  status: "ACTIVE" | "REVOKED";
  roles: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthSessionRecord {
  sessionId: string;
  accessToken: string;
  expiresAt: string;
}

export interface AuthVerificationResponse {
  status: string;
  result: {
    walletAddress: string;
    nonce: string;
    domain: string;
    identity: AuthIdentityRecord;
    session: AuthSessionRecord;
  };
}

export interface AuthMeResponse {
  session: {
    sessionId: string;
    identityId: string;
    roles?: string[];
    expiresAt?: string;
    deviceId: string | null;
  };
  identity: AuthIdentityRecord;
}
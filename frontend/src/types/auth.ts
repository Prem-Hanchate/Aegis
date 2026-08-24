export interface AuthChallengeResponse {
  challenge: {
    nonce: string;
    walletAddress: string;
    domain: string;
    message: string;
    issuedAt: string;
    expiresAt: string;
    purpose: string;
  };
}

export interface AuthVerificationResponse {
  status: string;
  result: {
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
  };
}
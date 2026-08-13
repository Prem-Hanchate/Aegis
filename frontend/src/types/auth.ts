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
  };
}
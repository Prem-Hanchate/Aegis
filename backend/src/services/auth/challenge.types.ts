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
}
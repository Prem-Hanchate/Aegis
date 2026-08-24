import type { Request, Response } from "express";
import { issueLoginChallenge, verifyLoginChallenge } from "../services/auth/auth.service.js";
import { revokeSession } from "../services/session.service.js";

export function createLoginChallengeController(request: Request, response: Response) {
  const { walletAddress } = request.body as { walletAddress: string };
  const challenge = issueLoginChallenge(walletAddress);

  return response.status(201).json({
    challenge,
  });
}

export function verifyLoginChallengeController(request: Request, response: Response) {
  const { walletAddress, message, signature } = request.body as {
    walletAddress: string;
    message: string;
    signature: string;
  };

  const result = verifyLoginChallenge(walletAddress, message, signature);

  return response.status(200).json({
    status: "authenticated",
    result,
  });
}

export function logoutController(request: Request, response: Response) {
  const authorization = request.header("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!accessToken) {
    return response.status(401).json({
      error: { code: "SESSION_MISSING", message: "A bearer access token is required.", details: null },
    });
  }

  revokeSession(accessToken);
  return response.status(204).send();
}
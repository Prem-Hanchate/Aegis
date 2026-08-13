import type { Request, Response } from "express";
import { issueLoginChallenge, verifyLoginChallenge } from "../services/auth/auth.service.js";

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
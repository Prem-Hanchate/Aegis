import type { Request, Response } from "express";
import { issueLoginChallengeAsync, verifyLoginChallengeAsync } from "../services/auth/auth.service.js";
import { revokeSessionAsync } from "../services/session.service.js";
import { recordAuthenticationFailure, requireAuthenticatedRequest } from "../middleware/authentication.js";
import { revokeAllSessionsForIdentity } from "../services/session.service.js";
import { getIdentityAsync } from "../services/identity.service.js";
import { getPermissionsForRoles } from "../services/authorization/authorization.service.js";
import type { AuthVerificationResult } from "../services/auth/challenge.types.js";

export async function createLoginChallengeController(request: Request, response: Response) {
  const { walletAddress } = request.body as { walletAddress: string };
  try {
    const challenge = await issueLoginChallengeAsync(walletAddress);

    return response.status(201).json({
      challenge,
    });
  } catch (error) {
    recordAuthenticationFailure(request, error instanceof Error ? error.message : "Challenge issuance failed.");
    throw error;
  }
}

export async function verifyLoginChallengeController(request: Request, response: Response) {
  const { walletAddress, message, signature } = request.body as {
    walletAddress: string;
    message: string;
    signature: string;
  };

  let result: AuthVerificationResult;
  try {
    result = await verifyLoginChallengeAsync(walletAddress, message, signature);
  } catch (error) {
    recordAuthenticationFailure(request, error instanceof Error ? error.message : "Challenge verification failed.");
    throw error;
  }

  return response.status(200).json({
    status: "authenticated",
    result,
  });
}

export async function logoutController(request: Request, response: Response) {
  const authorization = request.header("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!accessToken) {
    return response.status(401).json({
      error: { code: "SESSION_MISSING", message: "A bearer access token is required.", details: null },
    });
  }

  await revokeSessionAsync(accessToken);
  return response.status(204).send();
}

export async function currentSessionController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  return response.status(200).json({
    session: auth,
    identity: {
      ...(await getIdentityAsync(auth.identityId)),
      permissions: getPermissionsForRoles(auth.roles),
    },
  });
}

export function revokeAllSessionsController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const revokedCount = revokeAllSessionsForIdentity(auth.identityId);
  return response.status(200).json({ revokedCount });
}
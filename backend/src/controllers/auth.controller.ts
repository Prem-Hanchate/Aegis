import type { Request, Response } from "express";
import { issueLoginChallenge, verifyLoginChallenge } from "../services/auth/auth.service.js";
import { revokeSession } from "../services/session.service.js";
import { requireAuthenticatedRequest } from "../middleware/authentication.js";
import { revokeAllSessionsForIdentity } from "../services/session.service.js";
import { getIdentity } from "../services/identity.service.js";
import { getPermissionsForRoles } from "../services/authorization/authorization.service.js";

export async function createLoginChallengeController(request: Request, response: Response) {
  const { walletAddress } = request.body as { walletAddress: string };
  const challenge = await issueLoginChallenge(walletAddress);

  return response.status(201).json({
    challenge,
  });
}

export async function verifyLoginChallengeController(request: Request, response: Response) {
  const { walletAddress, message, signature } = request.body as {
    walletAddress: string;
    message: string;
    signature: string;
  };

  const result = await verifyLoginChallenge(walletAddress, message, signature);

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

  await revokeSession(accessToken);
  return response.status(204).send();
}

export async function currentSessionController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  return response.status(200).json({
    session: auth,
    identity: {
      ...(await getIdentity(auth.identityId)),
      permissions: await getPermissionsForRoles(auth.roles),
    },
  });
}

export async function revokeAllSessionsController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const revokedCount = await revokeAllSessionsForIdentity(auth.identityId);
  return response.status(200).json({ revokedCount });
}
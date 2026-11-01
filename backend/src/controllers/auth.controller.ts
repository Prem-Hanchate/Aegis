import type { Request, Response } from "express";
import { issueLoginChallenge, verifyLoginChallenge } from "../services/auth/auth.service.js";
import { revokeSession } from "../services/session.service.js";
import { recordAuthenticationFailure, requireAuthenticatedRequest } from "../middleware/authentication.js";
import { revokeAllSessionsForIdentity } from "../services/session.service.js";
import { getIdentity } from "../services/identity.service.js";
import { getPermissionsForRoles } from "../services/authorization/authorization.service.js";
import type { AuthVerificationResult } from "../services/auth/challenge.types.js";
import { issueDeviceLoginChallenge, verifyDeviceLogin } from "../services/auth/device-auth.service.js";
import { getActiveDevice } from "../services/device.service.js";

export function createLoginChallengeController(request: Request, response: Response) {
  const { walletAddress } = request.body as { walletAddress: string };
  try {
    const challenge = issueLoginChallenge(walletAddress);

    return response.status(201).json({
      challenge,
    });
  } catch (error) {
    recordAuthenticationFailure(request, error instanceof Error ? error.message : "Challenge issuance failed.");
    throw error;
  }
}

export function verifyLoginChallengeController(request: Request, response: Response) {
  const { walletAddress, message, signature } = request.body as {
    walletAddress: string;
    message: string;
    signature: string;
  };

  let result: AuthVerificationResult;
  try {
    result = verifyLoginChallenge(walletAddress, message, signature);
  } catch (error) {
    recordAuthenticationFailure(request, error instanceof Error ? error.message : "Challenge verification failed.");
    throw error;
  }

  return response.status(200).json({
    status: "authenticated",
    result,
  });
}

export async function createDeviceLoginChallengeController(request: Request, response: Response) {
  const { deviceId } = request.body as { deviceId: string };
  return response.status(201).json({ challenge: await issueDeviceLoginChallenge(deviceId) });
}

export async function verifyDeviceLoginController(request: Request, response: Response) {
  const { deviceId, nonce, timestamp, signature } = request.body as {
    deviceId: string;
    nonce: string;
    timestamp: string;
    signature: string;
  };
  return response.status(200).json({
    status: "authenticated",
    result: await verifyDeviceLogin(deviceId, nonce, timestamp, signature),
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

export function currentSessionController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const identity = getIdentity(auth.identityId);
  const device = auth.deviceId ? getActiveDevice(auth.deviceId, auth.identityId) : null;
  const rolePermissions = getPermissionsForRoles(auth.roles);
  const permissions = device?.permissions.length
    ? rolePermissions.filter((permission) => device.permissions.includes(permission))
    : rolePermissions;
  return response.status(200).json({
    session: auth,
    identity: {
      ...identity,
      permissions,
    },
  });
}

export function revokeAllSessionsController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const revokedCount = revokeAllSessionsForIdentity(auth.identityId);
  return response.status(200).json({ revokedCount });
}
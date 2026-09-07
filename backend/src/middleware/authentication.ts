import type { NextFunction, Request, Response } from "express";
import { AppError } from "./AppError.js";
import { getIdentity } from "../services/identity.service.js";
import { getActiveSession } from "../services/session.service.js";
import { recordAuditEvent } from "../services/audit/audit.service.js";
import { getActiveDevice } from "../services/device.service.js";

export interface AuthenticatedRequest extends Request {
  auth: {
    sessionId: string;
    identityId: string;
    roles: string[];
    deviceId: string | null;
  };
}

export function authenticateRequest(request: Request, _response: Response, next: NextFunction) {
  const authorization = request.header("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

  if (!accessToken) {
    return next(new AppError("A bearer access token is required.", 401, "SESSION_MISSING"));
  }

  try {
    const session = getActiveSession(accessToken);
    const identity = getIdentity(session.identityId);
    if (identity.status !== "ACTIVE") {
      throw new AppError("The identity is revoked.", 403, "AUTH_IDENTITY_REVOKED");
    }
    if (session.deviceId) {
      getActiveDevice(session.deviceId, identity.identityId);
    }

    (request as AuthenticatedRequest).auth = {
      sessionId: session.sessionId,
      identityId: identity.identityId,
      roles: identity.roles,
      deviceId: session.deviceId,
    };
    return next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    return next(new AppError("The session could not be validated.", 401, "SESSION_INVALID"));
  }
}

export function requireAuthenticatedRequest(request: Request): AuthenticatedRequest {
  const authenticatedRequest = request as Partial<AuthenticatedRequest>;
  if (!authenticatedRequest.auth) {
    throw new AppError("The request is not authenticated.", 401, "SESSION_MISSING");
  }
  return authenticatedRequest as AuthenticatedRequest;
}

export function recordAuthenticationFailure(request: Request, reason: string) {
  recordAuditEvent({
    eventType: "AUTHENTICATION_FAILURE",
    identityId: null,
    resource: request.path,
    action: request.method,
    outcome: "FAILURE",
    reason,
    actor: null,
  });
}

export function requireDevice(request: Request) {
  const authenticatedRequest = requireAuthenticatedRequest(request);
  if (!authenticatedRequest.auth.deviceId) {
    throw new AppError("An enrolled device is required.", 403, "DEVICE_REQUIRED");
  }
  return authenticatedRequest.auth.deviceId;
}
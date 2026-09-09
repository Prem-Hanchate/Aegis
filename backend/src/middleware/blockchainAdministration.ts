import type { NextFunction, Request, Response } from "express";
import { authenticateRequest } from "./authentication.js";
import { hasBlockchainConfiguration } from "../blockchain/config.js";
import { requireAuthorization } from "../services/authorization/authorization.service.js";

export function requireBlockchainAdministration(request: Request, response: Response, next: NextFunction) {
  if (!hasBlockchainConfiguration()) return next();
  return authenticateRequest(request, response, (error) => {
    if (error) return next(error);
    return requireAuthorization("policies", "manage")(request, response, next);
  });
}
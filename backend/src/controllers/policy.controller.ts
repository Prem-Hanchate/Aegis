import type { Request, Response } from "express";
import { grantRolePermission, listRolePermissions, revokeRolePermission } from "../services/authorization/authorization.service.js";
import { recordAuditEvent } from "../services/audit/audit.service.js";
import { requireAuthenticatedRequest } from "../middleware/authentication.js";
import { AppError } from "../middleware/AppError.js";

export function listPoliciesController(_request: Request, response: Response) {
  return response.status(200).json({ policies: listRolePermissions() });
}

export function grantPolicyController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const { role, resource, action } = request.body as { role: string; resource: string; action: string };
  const policy = grantRolePermission(role, resource, action);
  recordAuditEvent({ eventType: "POLICY_CHANGED", identityId: auth.identityId, resource, action, outcome: "SUCCESS", reason: "Permission granted.", actor: auth.identityId });
  return response.status(201).json({ policy });
}

export function revokePolicyController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const { resource, action } = request.body as { resource: string; action: string };
  const role = request.params.role;
  if (typeof role !== "string" || !role) {
    throw new AppError("Role is required.", 400, "POLICY_INVALID_ROLE");
  }
  const policy = revokeRolePermission(role, resource, action);
  recordAuditEvent({ eventType: "POLICY_CHANGED", identityId: auth.identityId, resource, action, outcome: "SUCCESS", reason: "Permission revoked.", actor: auth.identityId });
  return response.status(200).json({ policy });
}
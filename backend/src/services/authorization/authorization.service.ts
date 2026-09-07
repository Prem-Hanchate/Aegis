import { AppError } from "../../middleware/AppError.js";
import type { RequestHandler } from "express";
import { getIdentity } from "../identity.service.js";
import { recordAuditEvent } from "../audit/audit.service.js";

const rolePermissions: Record<string, Set<string>> = {
  employee: new Set(["employee:read", "reports:read"]),
  manager: new Set(["employee:read", "reports:read", "payroll:read"]),
  admin: new Set(["employee:read", "reports:read", "payroll:read", "policies:manage"]),
};

export function authorizeRequest(identityId: string, resource: string, action: string) {
  const identity = getIdentity(identityId);
  const permission = `${resource}:${action}`;
  const allowed = identity.status === "ACTIVE" && identity.roles.some((role) => rolePermissions[role]?.has(permission));

  recordAuditEvent({
    eventType: "ACCESS_DECISION",
    identityId,
    resource,
    action,
    outcome: allowed ? "ALLOWED" : "DENIED",
    reason: allowed ? null : "No active role grants this permission.",
    actor: identity.walletAddress,
  });

  if (!allowed) {
    throw new AppError("Access denied.", 403, "AUTHORIZATION_DENIED", { resource, action });
  }

  return { allowed: true, identityId, resource, action };
}

export function requireAuthorization(resource: string, action: string) {
  const middleware: RequestHandler = (request, _response, next) => {
    try {
      const authenticatedRequest = request as RequestWithAuth;
      if (!authenticatedRequest.auth) {
        throw new AppError("The request is not authenticated.", 401, "SESSION_MISSING");
      }
      authorizeRequest(authenticatedRequest.auth.identityId, resource, action);
      next();
    } catch (error) {
      next(error);
    }
  };

  return middleware;
}

interface RequestWithAuth {
  auth?: { identityId: string };
}

export function clearAuthorizationState() {
  for (const permissions of Object.values(rolePermissions)) {
    permissions.clear();
  }
  rolePermissions.employee = new Set(["employee:read", "reports:read"]);
  rolePermissions.manager = new Set(["employee:read", "reports:read", "payroll:read"]);
  rolePermissions.admin = new Set(["employee:read", "reports:read", "payroll:read", "policies:manage"]);
}

export function listRolePermissions() {
  return Object.fromEntries(Object.entries(rolePermissions).map(([role, permissions]) => [role, [...permissions]]));
}

export function grantRolePermission(role: string, resource: string, action: string) {
  const normalizedRole = role.trim();
  const permission = `${resource.trim()}:${action.trim()}`;
  if (!normalizedRole || permission === ":") {
    throw new AppError("Role, resource, and action are required.", 400, "POLICY_INVALID_INPUT");
  }
  rolePermissions[normalizedRole] ??= new Set();
  rolePermissions[normalizedRole].add(permission);
  return { role: normalizedRole, permissions: [...rolePermissions[normalizedRole]] };
}

export function revokeRolePermission(role: string, resource: string, action: string) {
  const permissions = rolePermissions[role];
  if (!permissions) {
    throw new AppError("Role not found.", 404, "POLICY_ROLE_NOT_FOUND");
  }
  permissions.delete(`${resource}:${action}`);
  return { role, permissions: [...permissions] };
}
import { AppError } from "../../middleware/AppError.js";
import type { RequestHandler } from "express";
import { getIdentity } from "../identity.service.js";
import { recordAuditEvent } from "../audit/audit.service.js";

const defaultRolePermissions: Record<string, string[]> = {
  employee: ["employee:read", "reports:read"],
  manager: ["employee:read", "reports:read", "payroll:read"],
  admin: ["employee:read", "reports:read", "payroll:read", "policies:manage"],
};

const rolePermissions: Record<string, Set<string>> = {
  employee: new Set(["employee:read", "reports:read"]),
  manager: new Set(["employee:read", "reports:read", "payroll:read"]),
  admin: new Set(["employee:read", "reports:read", "payroll:read", "policies:manage"]),
};

const supportedPermissions = new Set([
  "employee:read",
  "reports:read",
  "payroll:read",
  "policies:manage",
]);

export function assertSupportedPolicy(role: string, resource: string, action: string) {
  const normalizedRole = role.trim();
  const permission = `${resource.trim()}:${action.trim()}`;
  if (!Object.hasOwn(defaultRolePermissions, normalizedRole)) {
    throw new AppError("Role not found.", 404, "POLICY_ROLE_NOT_FOUND");
  }
  if (!supportedPermissions.has(permission)) {
    throw new AppError("Permission is not supported.", 400, "POLICY_PERMISSION_NOT_SUPPORTED");
  }
  return { role: normalizedRole, permission };
}

export function getPermissionsForRoles(roles: string[]) {
  return [...new Set(roles.flatMap((role) => [...(rolePermissions[role] ?? [])]))];
}

export function hasPermission(identityId: string, resource: string, action: string) {
  const identity = getIdentity(identityId);
  const permission = `${resource}:${action}`;
  return identity.status === "ACTIVE"
    && getPermissionsForRoles(identity.roles).includes(permission);
}

export function authorizeRequest(identityId: string, resource: string, action: string) {
  const identity = getIdentity(identityId);
  const allowed = hasPermission(identityId, resource, action);

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
  for (const role of Object.keys(rolePermissions)) {
    delete rolePermissions[role];
  }
  for (const [role, permissions] of Object.entries(defaultRolePermissions)) {
    rolePermissions[role] = new Set(permissions);
  }
}

export function listRolePermissions() {
  return Object.fromEntries(Object.entries(rolePermissions).map(([role, permissions]) => [role, [...permissions]]));
}

export function grantRolePermission(role: string, resource: string, action: string) {
  const { role: normalizedRole, permission } = assertSupportedPolicy(role, resource, action);
  const permissions = rolePermissions[normalizedRole];
  if (!permissions) {
    throw new AppError("Role not found.", 404, "POLICY_ROLE_NOT_FOUND");
  }
  permissions.add(permission);
  return { role: normalizedRole, permissions: [...permissions] };
}

export function revokeRolePermission(role: string, resource: string, action: string) {
  const { role: normalizedRole, permission } = assertSupportedPolicy(role, resource, action);
  const permissions = rolePermissions[normalizedRole];
  if (!permissions) {
    throw new AppError("Role not found.", 404, "POLICY_ROLE_NOT_FOUND");
  }
  permissions.delete(permission);
  return { role: normalizedRole, permissions: [...permissions] };
}
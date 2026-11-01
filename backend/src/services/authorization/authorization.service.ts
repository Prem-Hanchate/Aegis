import mongoose from "mongoose";
import { AppError } from "../../middleware/AppError.js";
import type { RequestHandler } from "express";
import { getIdentity } from "../identity.service.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { policyRepository } from "../../repositories/policy.repository.js";
import { IdentityModel } from "../../models/index.js";

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

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function assertSupportedPolicy(role: string, resource: string, action: string) {
  const normalizedRole = role.trim();
  const permission = `${resource.trim()}:${action.trim()}`;
  if (!Object.hasOwn(rolePermissions, normalizedRole)) {
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
  const permission = `${resource.trim()}:${action.trim()}`;
  return identity.status === "ACTIVE" && identity.roles.some((role) => rolePermissions[role]?.has(permission));
}

export function authorizeRequest(identityId: string, resource: string, action: string) {

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

export async function authorizeRequestAsync(identityId: string, resource: string, action: string) {
  if (isDbConnected()) {
    const identityDoc = await IdentityModel.findOne({ identityId }).lean().exec();
    if (!identityDoc) {
      throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
    }
    const permission = `${resource}:${action}`;
    const policies = await policyRepository.listAll();
    const allowed =
      identityDoc.status === "ACTIVE" &&
      identityDoc.roles.some((role) => {
        const policy = policies.find((p) => p.role === role);
        return policy?.permissions.includes(permission);
      });

    recordAuditEvent({
      eventType: "ACCESS_DECISION",
      identityId,
      resource,
      action,
      outcome: allowed ? "ALLOWED" : "DENIED",
      reason: allowed ? null : "No active role grants this permission.",
      actor: identityDoc.walletAddress,
    });

    if (!allowed) {
      throw new AppError("Access denied.", 403, "AUTHORIZATION_DENIED", { resource, action });
    }

    return { allowed: true, identityId, resource, action };
  }
  return authorizeRequest(identityId, resource, action);
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

export function resetAuthorizationMemoryStore() {
  for (const permissions of Object.values(rolePermissions)) {
    permissions.clear();
  }
}

export function clearAuthorizationState() {
  for (const role of Object.keys(rolePermissions)) {
    delete rolePermissions[role];
  }
  for (const [role, permissions] of Object.entries(defaultRolePermissions)) {
    rolePermissions[role] = new Set(permissions);
  }

  rolePermissions.employee = new Set(["employee:read", "reports:read"]);
  rolePermissions.manager = new Set(["employee:read", "reports:read", "payroll:read"]);
  rolePermissions.admin = new Set(["employee:read", "reports:read", "payroll:read", "policies:manage"]);

  if (isDbConnected()) {
    void policyRepository.clear().then(() => policyRepository.seedDefaults()).catch((err) => {
      console.error("Failed to reset policies in MongoDB:", err);
    });
  }
}

export function listRolePermissions() {
  return Object.fromEntries(Object.entries(rolePermissions).map(([role, permissions]) => [role, [...permissions]]));
}


export async function listRolePermissionsAsync() {
  if (isDbConnected()) {
    const policies = await policyRepository.listAll();
    const result: Record<string, string[]> = {};
    for (const p of policies) {
      result[p.role] = p.permissions;
    }
    return result;
  }
  return listRolePermissions();
}

export function grantRolePermission(role: string, resource: string, action: string): { role: string; permissions: string[] } {
  const normalizedRole = role.trim();
  const permission = `${resource.trim()}:${action.trim()}`;
  if (!normalizedRole || permission === ":") {
    throw new AppError("Role, resource, and action are required.", 400, "POLICY_INVALID_INPUT");
  }
  rolePermissions[normalizedRole] ??= new Set();
  rolePermissions[normalizedRole].add(permission);

  if (isDbConnected()) {
    void policyRepository.grantPermission(normalizedRole, permission).catch((err) => {
      console.error("Failed to grant policy permission in MongoDB:", err);
    });
  }

  return { role: normalizedRole, permissions: [...rolePermissions[normalizedRole]] };
}

export async function grantRolePermissionAsync(role: string, resource: string, action: string): Promise<{ role: string; permissions: string[] }> {
  const normalizedRole = role.trim();
  const permission = `${resource.trim()}:${action.trim()}`;
  if (!normalizedRole || permission === ":") {
    throw new AppError("Role, resource, and action are required.", 400, "POLICY_INVALID_INPUT");
  }
  rolePermissions[normalizedRole] ??= new Set();
  rolePermissions[normalizedRole].add(permission);

  if (isDbConnected()) {
    await policyRepository.grantPermission(normalizedRole, permission);
  }

  return { role: normalizedRole, permissions: [...rolePermissions[normalizedRole]] };
}

export function revokeRolePermission(role: string, resource: string, action: string): { role: string; permissions: string[] } {
  const permissions = rolePermissions[role];
  if (!permissions) {
    throw new AppError("Role not found.", 404, "POLICY_ROLE_NOT_FOUND");
  }
  const permission = `${resource}:${action}`;
  permissions.delete(permission);

  if (isDbConnected()) {
    void policyRepository.revokePermission(role, permission).catch((err) => {
      console.error("Failed to revoke policy permission in MongoDB:", err);
    });
  }

  return { role, permissions: [...permissions] };
}

export async function revokeRolePermissionAsync(role: string, resource: string, action: string): Promise<{ role: string; permissions: string[] }> {
  const permissions = rolePermissions[role];
  if (!permissions) {
    throw new AppError("Role not found.", 404, "POLICY_ROLE_NOT_FOUND");
  }
  const permission = `${resource}:${action}`;
  permissions.delete(permission);

  if (isDbConnected()) {
    await policyRepository.revokePermission(role, permission);
  }

  return { role, permissions: [...permissions] };
}

export async function rehydratePolicyStore(): Promise<void> {
  if (isDbConnected()) {
    const policies = await policyRepository.listAll();
    if (policies.length === 0) {
      await policyRepository.seedDefaults();
      return;
    }
    for (const p of policies) {
      rolePermissions[p.role] = new Set(p.permissions);
    }
  }
}

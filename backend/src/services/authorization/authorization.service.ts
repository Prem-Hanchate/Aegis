import { AppError } from "../../middleware/AppError.js";
import type { RequestHandler } from "express";
import { policyRepository } from "../../repositories/index.js";
import { getIdentity } from "../identity.service.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

const defaultRolePermissions: Record<string, string[]> = {
  employee: ["employee:read", "reports:read"],
  manager: ["employee:read", "reports:read", "payroll:read"],
  admin: ["employee:read", "reports:read", "payroll:read", "policies:manage"],
};
const supportedPermissions = new Set(["employee:read", "reports:read", "payroll:read", "policies:manage"]);
const POLICY_BOOTSTRAP_ROLE = "__system__";
const POLICY_BOOTSTRAP_PERMISSION = "__defaults_initialized__";
const ensureDefaults = async () => {
  const existing = await policyRepository.list();
  if (existing.some((policy) => policy.role === POLICY_BOOTSTRAP_ROLE && policy.permission === POLICY_BOOTSTRAP_PERMISSION)) {
    return;
  }
  const present = new Set(existing.map((policy) => `${policy.role}:${policy.permission}`));
  await Promise.all(Object.entries(defaultRolePermissions).flatMap(([role, permissions]) => permissions
    .filter((permission) => !present.has(`${role}:${permission}`))
    .map((permission) => {
      const [resource = "", action = ""] = permission.split(":");
      const now = new Date().toISOString();
      return policyRepository.upsert({ role, resource, action, permission, createdAt: now, updatedAt: now });
    })));
  const now = new Date().toISOString();
  await policyRepository.upsert({
    role: POLICY_BOOTSTRAP_ROLE,
    resource: POLICY_BOOTSTRAP_ROLE,
    action: POLICY_BOOTSTRAP_PERMISSION,
    permission: POLICY_BOOTSTRAP_PERMISSION,
    createdAt: now,
    updatedAt: now,
  });
};

export function assertSupportedPolicy(role: string, resource: string, action: string) {
  const normalizedRole = role.trim();
  const permission = `${resource.trim()}:${action.trim()}`;
  if (!Object.hasOwn(defaultRolePermissions, normalizedRole)) throw new AppError("Role not found.", 404, "POLICY_ROLE_NOT_FOUND");
  if (!supportedPermissions.has(permission)) throw new AppError("Permission is not supported.", 400, "POLICY_PERMISSION_NOT_SUPPORTED");
  return { role: normalizedRole, permission };
}
export async function getPermissionsForRoles(roles: string[]) {
  await ensureDefaults();
  const policies = (await policyRepository.list()).filter((policy) => Object.hasOwn(defaultRolePermissions, policy.role));
  const allowed = new Set(roles);
  return policies.filter((policy) => allowed.has(policy.role)).map((policy) => policy.permission);
}
export async function hasPermission(identityId: string, resource: string, action: string) {
  const identity = await getIdentity(identityId);
  return identity.status === "ACTIVE" && (await getPermissionsForRoles(identity.roles)).includes(`${resource}:${action}`);
}
export async function authorizeRequest(identityId: string, resource: string, action: string) {
  const identity = await getIdentity(identityId);
  const allowed = await hasPermission(identityId, resource, action);
  await recordAuditEvent({ eventType: "ACCESS_DECISION", identityId, resource, action, outcome: allowed ? "ALLOWED" : "DENIED", reason: allowed ? null : "No active role grants this permission.", actor: identity.walletAddress });
  if (!allowed) throw new AppError("Access denied.", 403, "AUTHORIZATION_DENIED", { resource, action });
  return { allowed: true, identityId, resource, action };
}
export function requireAuthorization(resource: string, action: string) {
  const middleware: RequestHandler = asyncHandler(async (request, _response, next) => {
    const authenticatedRequest = request as RequestWithAuth;
    if (!authenticatedRequest.auth) {
      return next(new AppError("The request is not authenticated.", 401, "SESSION_MISSING"));
    }
    await authorizeRequest(authenticatedRequest.auth.identityId, resource, action);
    return next();
  });
  return middleware;
}
interface RequestWithAuth { auth?: { identityId: string } }
export async function clearAuthorizationState() {
  if (process.env.NODE_ENV !== "test") throw new AppError("Authorization clearing is only available in tests.", 403, "TEST_ONLY_OPERATION");
  await policyRepository.clear();
  await ensureDefaults();
}
export async function listRolePermissions() {
  await ensureDefaults();
  const policies = (await policyRepository.list()).filter((policy) => Object.hasOwn(defaultRolePermissions, policy.role));
  return Object.fromEntries(Object.keys(defaultRolePermissions).map((role) => [role, policies.filter((policy) => policy.role === role).map((policy) => policy.permission)]));
}
export async function grantRolePermission(role: string, resource: string, action: string) {
  const { role: normalizedRole, permission } = assertSupportedPolicy(role, resource, action);
  const now = new Date().toISOString();
  await policyRepository.upsert({ role: normalizedRole, resource: resource.trim(), action: action.trim(), permission, createdAt: now, updatedAt: now });
  return { role: normalizedRole, permissions: await getPermissionsForRoles([normalizedRole]) };
}
export async function revokeRolePermission(role: string, resource: string, action: string) {
  const { role: normalizedRole, permission } = assertSupportedPolicy(role, resource, action);
  await policyRepository.delete(normalizedRole, permission);
  return { role: normalizedRole, permissions: await getPermissionsForRoles([normalizedRole]) };
}

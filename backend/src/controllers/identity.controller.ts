import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { AppError } from "../middleware/AppError.js";
import { submitBlockchainWrite } from "../services/blockchain.service.js";
import {
  assignRole,
  assertIdentityRegistrationAvailable,
  getIdentity,
  getIdentityByWallet,
  listIdentities,
  removeRole,
  registerIdentity,
  updateIdentityProfile,
  updateIdentityStatus,
  type IdentityStatus,
} from "../services/identity.service.js";
import { requireAuthenticatedRequest } from "../middleware/authentication.js";
import { z } from "zod";
import { recordAuditEvent } from "../services/audit/audit.service.js";

const identityQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", "REVOKED"]).optional(),
});

export async function createIdentityController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const { walletAddress, displayName } = request.body as { walletAddress: string; displayName: string };
  assertIdentityRegistrationAvailable(walletAddress);
  const identityId = randomUUID();
  const transaction = await submitBlockchainWrite(async (client) => ({
    registration: await client.registerIdentity(identityId, walletAddress),
    activation: await client.activateIdentity(identityId),
    status: "confirmed" as const,
  }));
  const identity = registerIdentity(walletAddress, displayName, identityId);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: identity.identityId, resource: "identities", action: "register", outcome: "SUCCESS", reason: "Identity registered.", actor: auth.identityId });
  return response.status(201).json({ identity, transaction });
}

export function listIdentitiesController(request: Request, response: Response) {
  const query = identityQuerySchema.parse(request.query);
  return response.status(200).json({ identities: listIdentities(query) });
}

export function getIdentityController(request: Request, response: Response) {
  const identityId = getIdentityId(request);
  return response.status(200).json({ identity: getIdentity(identityId) });
}

export async function updateIdentityStatusController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const { status } = request.body as { status: IdentityStatus };
  const identityId = getIdentityId(request);
  const transaction = status === "ACTIVE"
    ? await submitBlockchainWrite((client) => client.activateIdentity(identityId))
    : await submitBlockchainWrite((client) => client.revokeIdentity(identityId));
  const identity = updateIdentityStatus(identityId, status);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId, resource: "identities", action: status === "ACTIVE" ? "activate" : "revoke", outcome: "SUCCESS", reason: `Identity status changed to ${status}.`, actor: auth.identityId });
  return response.status(200).json({ identity, transaction });
}

function getIdentityId(request: Request) {
  const { identityId } = request.params;
  if (typeof identityId !== "string" || identityId.length === 0) {
    throw new AppError("Identity id is required.", 400, "IDENTITY_INVALID_ID");
  }
  return identityId;
}

export async function assignIdentityRoleController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const identityId = getIdentityId(request);
  if (identityId === auth.identityId) {
    throw new AppError("Administrators cannot change their own roles.", 403, "IDENTITY_SELF_ROLE_CHANGE");
  }
  const { role } = request.body as { role: string };
  const transaction = await submitBlockchainWrite((client) => client.assignRole(identityId, role));
  const identity = assignRole(identityId, role);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId, resource: "identities", action: "assign-role", outcome: "SUCCESS", reason: `Role ${role} assigned.`, actor: auth.identityId });
  return response.status(200).json({ identity, transaction });
}

export async function removeIdentityRoleController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const identityId = getIdentityId(request);
  if (identityId === auth.identityId) {
    throw new AppError("Administrators cannot change their own roles.", 403, "IDENTITY_SELF_ROLE_CHANGE");
  }
  const role = request.body.role as string;
  const transaction = await submitBlockchainWrite((client) => client.removeRole(identityId, role));
  const identity = removeRole(identityId, role);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId, resource: "identities", action: "remove-role", outcome: "SUCCESS", reason: `Role ${role} removed.`, actor: auth.identityId });
  return response.status(200).json({ identity, transaction });
}

export function getIdentityByWalletController(request: Request, response: Response) {
  const walletAddress = request.params.walletAddress;
  if (typeof walletAddress !== "string" || !walletAddress) {
    throw new AppError("Wallet address is required.", 400, "IDENTITY_INVALID_WALLET_ADDRESS");
  }

  const identity = getIdentityByWallet(walletAddress);
  if (!identity) {
    throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
  }
  return response.status(200).json({ identity });
}

export function updateIdentityProfileController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const identityId = getIdentityId(request);
  const { displayName } = request.body as { displayName: string };
  const identity = updateIdentityProfile(identityId, displayName);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId, resource: "identities", action: "update-profile", outcome: "SUCCESS", reason: "Identity profile updated.", actor: auth.identityId });
  return response.status(200).json({ identity });
}
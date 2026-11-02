import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { AppError } from "../middleware/AppError.js";
import { submitBlockchainWrite } from "../services/blockchain.service.js";
import {
  assertIdentityRegistrationAvailable,
  getIdentityAsync,
  getIdentityByWalletAsync,
  listIdentitiesAsync,
  removeRoleAsync,
  registerIdentityAsync,
  updateIdentityProfileAsync,
  updateIdentityStatusAsync,
  assignRoleAsync,
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
  if (await getIdentityByWalletAsync(walletAddress)) {
    throw new AppError("An identity already exists for this wallet.", 409, "IDENTITY_ALREADY_EXISTS");
  }
  const identityId = randomUUID();
  const transaction = await submitBlockchainWrite(async (client) => ({
    registration: await client.registerIdentity(identityId, walletAddress),
    activation: await client.activateIdentity(identityId),
    status: "confirmed" as const,
  }));
  const identity = await registerIdentityAsync(walletAddress, displayName, identityId);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId: identity.identityId, resource: "identities", action: "register", outcome: "SUCCESS", reason: "Identity registered.", actor: auth.identityId });
  recordAuditEvent({ eventType: "IDENTITY_REGISTERED", identityId: identity.identityId, resource: "identities", action: "register", outcome: "SUCCESS", reason: "Identity registered.", actor: auth.identityId });
  return response.status(201).json({ identity, transaction });
}

export async function listIdentitiesController(request: Request, response: Response) {
  const query = identityQuerySchema.parse(request.query);
  const identities = await listIdentitiesAsync();
  const search = query.search?.toLowerCase();
  return response.status(200).json({
    identities: identities.filter((identity) =>
      (!query.status || identity.status === query.status) &&
      (!search || `${identity.displayName} ${identity.walletAddress} ${identity.roles.join(" ")}`.toLowerCase().includes(search))),
  });
}

export async function getIdentityController(request: Request, response: Response) {
  const identityId = getIdentityId(request);
  return response.status(200).json({ identity: await getIdentityAsync(identityId) });
}

export async function updateIdentityStatusController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const { status } = request.body as { status: IdentityStatus };
  const identityId = getIdentityId(request);
  let identity;
  let transaction = null;
  if (status === "REVOKED") {
    // Database revocation is authoritative for application access while chain sync is pending.
    identity = await updateIdentityStatusAsync(identityId, status);
    try {
      transaction = await submitBlockchainWrite((client) => client.revokeIdentity(identityId));
    } catch (error) {
      recordAuditEvent({
        eventType: "IDENTITY_REVOKED",
        identityId,
        resource: "identities",
        action: "revoke",
        outcome: "FAILURE",
        reason: error instanceof Error ? error.message : "Blockchain revocation failed.",
        actor: auth.identityId,
      });
      throw error;
    }
  } else {
    transaction = await submitBlockchainWrite((client) => client.activateIdentity(identityId));
    identity = await updateIdentityStatusAsync(identityId, status);
  }
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId, resource: "identities", action: status === "ACTIVE" ? "activate" : "revoke", outcome: "SUCCESS", reason: `Identity status changed to ${status}.`, actor: auth.identityId });
  if (status === "REVOKED") {
    recordAuditEvent({ eventType: "IDENTITY_REVOKED", identityId, resource: "identities", action: "revoke", outcome: "SUCCESS", reason: "Identity revoked.", actor: auth.identityId });
  }
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
  const identity = await assignRoleAsync(identityId, role);
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
  const identity = await removeRoleAsync(identityId, role);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId, resource: "identities", action: "remove-role", outcome: "SUCCESS", reason: `Role ${role} removed.`, actor: auth.identityId });
  return response.status(200).json({ identity, transaction });
}

export async function getIdentityByWalletController(request: Request, response: Response) {
  const walletAddress = request.params.walletAddress;
  if (typeof walletAddress !== "string" || !walletAddress) {
    throw new AppError("Wallet address is required.", 400, "IDENTITY_INVALID_WALLET_ADDRESS");
  }

  const identity = await getIdentityByWalletAsync(walletAddress);
  if (!identity) {
    throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
  }
  return response.status(200).json({ identity });
}

export async function updateIdentityProfileController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  const identityId = getIdentityId(request);
  const { displayName } = request.body as { displayName: string };
  const identity = await updateIdentityProfileAsync(identityId, displayName);
  recordAuditEvent({ eventType: "ADMIN_ACTION", identityId, resource: "identities", action: "update-profile", outcome: "SUCCESS", reason: "Identity profile updated.", actor: auth.identityId });
  return response.status(200).json({ identity });
}

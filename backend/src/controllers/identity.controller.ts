import type { Request, Response } from "express";
import { AppError } from "../middleware/AppError.js";
import {
  assignRole,
  getIdentity,
  getIdentityByWallet,
  listIdentities,
  removeRole,
  registerIdentity,
  updateIdentityProfile,
  updateIdentityStatus,
  type IdentityStatus,
} from "../services/identity.service.js";

export function createIdentityController(request: Request, response: Response) {
  const { walletAddress, displayName } = request.body as { walletAddress: string; displayName: string };
  return response.status(201).json({ identity: registerIdentity(walletAddress, displayName) });
}

export function listIdentitiesController(_request: Request, response: Response) {
  return response.status(200).json({ identities: listIdentities() });
}

export function getIdentityController(request: Request, response: Response) {
  const identityId = getIdentityId(request);
  return response.status(200).json({ identity: getIdentity(identityId) });
}

export function updateIdentityStatusController(request: Request, response: Response) {
  const { status } = request.body as { status: IdentityStatus };
  const identityId = getIdentityId(request);
  return response.status(200).json({ identity: updateIdentityStatus(identityId, status) });
}

function getIdentityId(request: Request) {
  const { identityId } = request.params;
  if (typeof identityId !== "string" || identityId.length === 0) {
    throw new AppError("Identity id is required.", 400, "IDENTITY_INVALID_ID");
  }
  return identityId;
}

export function assignIdentityRoleController(request: Request, response: Response) {
  const identityId = getIdentityId(request);
  const { role } = request.body as { role: string };
  return response.status(200).json({ identity: assignRole(identityId, role) });
}

export function removeIdentityRoleController(request: Request, response: Response) {
  const identityId = getIdentityId(request);
  const role = request.body.role as string;
  return response.status(200).json({ identity: removeRole(identityId, role) });
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
  const identityId = getIdentityId(request);
  const { displayName } = request.body as { displayName: string };
  return response.status(200).json({ identity: updateIdentityProfile(identityId, displayName) });
}
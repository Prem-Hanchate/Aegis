import { randomUUID } from "node:crypto";
import { getAddress } from "ethers";
import { AppError } from "../middleware/AppError.js";
import { revokeSessionsForIdentity } from "./session.service.js";

export type IdentityStatus = "ACTIVE" | "REVOKED";

export interface Identity {
  identityId: string;
  walletAddress: string;
  displayName: string;
  status: IdentityStatus;
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

const identities = new Map<string, Identity>();

function normalizeWalletAddress(walletAddress: string) {
  try {
    return getAddress(walletAddress);
  } catch {
    throw new AppError("Invalid wallet address.", 400, "IDENTITY_INVALID_WALLET_ADDRESS");
  }
}

function findByWallet(walletAddress: string) {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  return [...identities.values()].find((identity) => identity.walletAddress === normalizedWalletAddress) ?? null;
}

export function registerIdentity(walletAddress: string, displayName: string): Identity {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  if (findByWallet(normalizedWalletAddress)) {
    throw new AppError("An identity already exists for this wallet.", 409, "IDENTITY_ALREADY_EXISTS");
  }

  const now = new Date().toISOString();
  const identity: Identity = {
    identityId: randomUUID(),
    walletAddress: normalizedWalletAddress,
    displayName: displayName.trim(),
    status: "ACTIVE",
    roles: [],
    createdAt: now,
    updatedAt: now,
  };

  identities.set(identity.identityId, identity);
  return identity;
}

export function listIdentities() {
  return [...identities.values()];
}

export function getIdentity(identityId: string) {
  const identity = identities.get(identityId);
  if (!identity) {
    throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
  }
  return identity;
}

export function getIdentityByWallet(walletAddress: string) {
  return findByWallet(walletAddress);
}

export function updateIdentityProfile(identityId: string, displayName: string) {
  const identity = getIdentity(identityId);
  const normalizedDisplayName = displayName.trim();
  if (!normalizedDisplayName) {
    throw new AppError("Display name is required.", 400, "IDENTITY_INVALID_DISPLAY_NAME");
  }

  const updatedIdentity = { ...identity, displayName: normalizedDisplayName, updatedAt: new Date().toISOString() };
  identities.set(identityId, updatedIdentity);
  return updatedIdentity;
}

export function updateIdentityStatus(identityId: string, status: IdentityStatus) {
  const identity = getIdentity(identityId);
  const updatedIdentity = { ...identity, status, updatedAt: new Date().toISOString() };
  identities.set(identityId, updatedIdentity);
  if (status === "REVOKED") {
    revokeSessionsForIdentity(identityId);
  }
  return updatedIdentity;
}

export function clearIdentityStore() {
  identities.clear();
}

export function assignRole(identityId: string, role: string) {
  const identity = getIdentity(identityId);
  const normalizedRole = role.trim();
  if (!normalizedRole) {
    throw new AppError("Role is required.", 400, "IDENTITY_INVALID_ROLE");
  }

  if (identity.roles.includes(normalizedRole)) {
    return identity;
  }

  const updatedIdentity = { ...identity, roles: [...identity.roles, normalizedRole], updatedAt: new Date().toISOString() };
  identities.set(identityId, updatedIdentity);
  return updatedIdentity;
}

export function removeRole(identityId: string, role: string) {
  const identity = getIdentity(identityId);
  const updatedIdentity = {
    ...identity,
    roles: identity.roles.filter((assignedRole) => assignedRole !== role.trim()),
    updatedAt: new Date().toISOString(),
  };
  identities.set(identityId, updatedIdentity);
  return updatedIdentity;
}
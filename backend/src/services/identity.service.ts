import { randomUUID } from "node:crypto";
import { getAddress } from "ethers";
import { AppError } from "../middleware/AppError.js";
import { identityRepository } from "../repositories/index.js";
import { revokeSessionsForIdentity } from "./session.service.js";

export type IdentityStatus = "ACTIVE" | "REVOKED";
export interface Identity {
  identityId: string; walletAddress: string; displayName: string; status: IdentityStatus;
  roles: string[]; createdAt: string; updatedAt: string;
}

function normalizeWalletAddress(walletAddress: string) {
  try { return getAddress(walletAddress); } catch { throw new AppError("Invalid wallet address.", 400, "IDENTITY_INVALID_WALLET_ADDRESS"); }
}

export async function assertIdentityRegistrationAvailable(walletAddress: string) {
  if (await identityRepository.findByWallet(normalizeWalletAddress(walletAddress))) {
    throw new AppError("An identity already exists for this wallet.", 409, "IDENTITY_ALREADY_EXISTS");
  }
}

export async function registerIdentity(walletAddress: string, displayName: string, identityId = randomUUID()) {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  await assertIdentityRegistrationAvailable(normalizedWalletAddress);
  const now = new Date().toISOString();
  try {
    return await identityRepository.create({ identityId, walletAddress: normalizedWalletAddress, displayName: displayName.trim(), status: "ACTIVE", roles: [], createdAt: now, updatedAt: now });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      throw new AppError("An identity already exists for this wallet.", 409, "IDENTITY_ALREADY_EXISTS");
    }
    throw error;
  }
}

export async function listIdentities(filter: { search?: string; status?: IdentityStatus } = {}) {
  const search = filter.search?.trim().toLowerCase();
  const identities = await identityRepository.list({ status: filter.status });
  return identities.filter((identity) => !search
    || identity.displayName.toLowerCase().includes(search)
    || identity.walletAddress.toLowerCase().includes(search)
    || identity.roles.some((role) => role.toLowerCase().includes(search)));
}

export async function getIdentity(identityId: string) {
  const identity = await identityRepository.findById(identityId);
  if (!identity) throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
  return identity;
}

export async function getIdentityByWallet(walletAddress: string) {
  return identityRepository.findByWallet(normalizeWalletAddress(walletAddress));
}

export async function updateIdentityProfile(identityId: string, displayName: string) {
  const normalizedDisplayName = displayName.trim();
  if (!normalizedDisplayName) throw new AppError("Display name is required.", 400, "IDENTITY_INVALID_DISPLAY_NAME");
  const identity = await identityRepository.update(identityId, { displayName: normalizedDisplayName });
  if (!identity) throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
  return identity;
}

export async function updateIdentityStatus(identityId: string, status: IdentityStatus) {
  const identity = await identityRepository.update(identityId, { status });
  if (!identity) throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
  if (status === "REVOKED") await revokeSessionsForIdentity(identityId);
  return identity;
}

export async function clearIdentityStore() {
  if (process.env.NODE_ENV !== "test") throw new AppError("Identity store clearing is only available in tests.", 403, "TEST_ONLY_OPERATION");
  await identityRepository.clear();
}

export async function assignRole(identityId: string, role: string) {
  const identity = await getIdentity(identityId);
  const normalizedRole = role.trim();
  if (!normalizedRole) throw new AppError("Role is required.", 400, "IDENTITY_INVALID_ROLE");
  if (identity.roles.includes(normalizedRole)) return identity;
  const updated = await identityRepository.update(identityId, { roles: [...identity.roles, normalizedRole] });
  if (!updated) throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
  return updated;
}

export async function removeRole(identityId: string, role: string) {
  const identity = await getIdentity(identityId);
  const updated = await identityRepository.update(identityId, { roles: identity.roles.filter((assignedRole) => assignedRole !== role.trim()) });
  if (!updated) throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
  return updated;
}

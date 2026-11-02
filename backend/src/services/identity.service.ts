import { randomUUID } from "node:crypto";
import { getAddress } from "ethers";
import mongoose from "mongoose";
import { AppError } from "../middleware/AppError.js";
import { revokeSessionsForIdentity } from "./session.service.js";
import { identityRepository } from "../repositories/identity.repository.js";
import { policyRepository } from "../repositories/policy.repository.js";

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

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

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

export function assertIdentityRegistrationAvailable(walletAddress: string) {
  if (findByWallet(walletAddress)) {
    throw new AppError("An identity already exists for this wallet.", 409, "IDENTITY_ALREADY_EXISTS");
  }
}

export function registerIdentity(
  walletAddress: string,
  displayName: string,
  identityId: string = randomUUID(),
): Identity {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  assertIdentityRegistrationAvailable(normalizedWalletAddress);

  const now = new Date().toISOString();
  const identity: Identity = {
    identityId,
    walletAddress: normalizedWalletAddress,
    displayName: displayName.trim(),
    status: "ACTIVE",
    roles: ["employee"],
    createdAt: now,
    updatedAt: now,
  };

  identities.set(identity.identityId, identity);

  if (isDbConnected()) {
    void identityRepository.create({
      identityId,
      walletAddress: normalizedWalletAddress,
      displayName: identity.displayName,
      status: "ACTIVE",
      roles: ["employee"],
    }).catch((err) => {
      console.error("Failed to persist identity to MongoDB:", err);
    });
  }

  return identity;
}

export async function registerIdentityAsync(walletAddress: string, displayName: string, identityId = randomUUID()): Promise<Identity> {
  const normalizedWalletAddress = normalizeWalletAddress(walletAddress);
  assertIdentityRegistrationAvailable(normalizedWalletAddress);

  const now = new Date().toISOString();
  const identity: Identity = {
    identityId,
    walletAddress: normalizedWalletAddress,
    displayName: displayName.trim(),
    status: "ACTIVE",
    roles: ["employee"],
    createdAt: now,
    updatedAt: now,
  };

  identities.set(identity.identityId, identity);

  if (isDbConnected()) {
    const saved = await identityRepository.create({
      identityId,
      walletAddress: normalizedWalletAddress,
      displayName: identity.displayName,
      status: "ACTIVE",
      roles: ["employee"],
    });
    return saved;
  }

  return identity;
}

export function listIdentities(filter: { search?: string; status?: IdentityStatus } = {}) {
  const search = filter.search?.trim().toLowerCase();
  return [...identities.values()].filter((identity) => {
    const matchesStatus = !filter.status || identity.status === filter.status;
    const matchesSearch = !search
      || identity.displayName.toLowerCase().includes(search)
      || identity.walletAddress.toLowerCase().includes(search)
      || identity.roles.some((role) => role.toLowerCase().includes(search));
    return matchesStatus && matchesSearch;
  });
}

export async function listIdentitiesAsync(): Promise<Identity[]> {
  if (isDbConnected()) {
    const list = await identityRepository.list();
    for (const item of list) {
      identities.set(item.identityId, item);
    }
    return list;
  }
  return listIdentities();
}

export function getIdentity(identityId: string) {
  const identity = identities.get(identityId);
  if (!identity) {
    throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
  }
  return identity;
}

export async function getIdentityAsync(identityId: string): Promise<Identity> {
  if (isDbConnected()) {
    const doc = await identityRepository.findById(identityId);
    if (!doc) {
      throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
    }
    identities.set(doc.identityId, doc);
    return doc;
  }
  return getIdentity(identityId);
}

export function getIdentityByWallet(walletAddress: string) {
  return findByWallet(walletAddress);
}

export async function getIdentityByWalletAsync(walletAddress: string): Promise<Identity | null> {
  if (isDbConnected()) {
    const doc = await identityRepository.findByWallet(walletAddress);
    if (doc) {
      identities.set(doc.identityId, doc);
      return doc;
    }
  }
  return getIdentityByWallet(walletAddress);
}

export function updateIdentityProfile(identityId: string, displayName: string): Identity {
  const identity = getIdentity(identityId);
  const normalizedDisplayName = displayName.trim();
  if (!normalizedDisplayName) {
    throw new AppError("Display name is required.", 400, "IDENTITY_INVALID_DISPLAY_NAME");
  }

  const updatedIdentity = { ...identity, displayName: normalizedDisplayName, updatedAt: new Date().toISOString() };
  identities.set(identityId, updatedIdentity);

  if (isDbConnected()) {
    void identityRepository.updateProfile(identityId, normalizedDisplayName).catch((err) => {
      console.error("Failed to update identity profile in MongoDB:", err);
    });
  }

  return updatedIdentity;
}

export async function updateIdentityProfileAsync(identityId: string, displayName: string): Promise<Identity> {
  const identity = getIdentity(identityId);
  const normalizedDisplayName = displayName.trim();
  if (!normalizedDisplayName) {
    throw new AppError("Display name is required.", 400, "IDENTITY_INVALID_DISPLAY_NAME");
  }

  const updatedIdentity = { ...identity, displayName: normalizedDisplayName, updatedAt: new Date().toISOString() };
  identities.set(identityId, updatedIdentity);

  if (isDbConnected()) {
    const updated = await identityRepository.updateProfile(identityId, normalizedDisplayName);
    if (updated) {
      identities.set(identityId, updated);
      return updated;
    }
  }

  return updatedIdentity;
}

export function updateIdentityStatus(identityId: string, status: IdentityStatus): Identity {
  const identity = getIdentity(identityId);
  const updatedIdentity = { ...identity, status, updatedAt: new Date().toISOString() };
  identities.set(identityId, updatedIdentity);

  if (status === "REVOKED") {
    revokeSessionsForIdentity(identityId);
  }

  if (isDbConnected()) {
    void identityRepository.updateStatus(identityId, status).catch((err) => {
      console.error("Failed to update identity status in MongoDB:", err);
    });
  }

  return updatedIdentity;
}

export async function updateIdentityStatusAsync(identityId: string, status: IdentityStatus): Promise<Identity> {
  const identity = await getIdentityAsync(identityId);
  if (status === "REVOKED" && identity.roles.includes("admin")) {
    const activeAdmins = (await listIdentitiesAsync()).filter((candidate) =>
      candidate.status === "ACTIVE" && candidate.roles.includes("admin"));
    if (activeAdmins.length <= 1) {
      throw new AppError("The last active administrator cannot be revoked.", 409, "IDENTITY_LAST_ADMIN");
    }
  }
  const updatedIdentity = { ...identity, status, updatedAt: new Date().toISOString() };
  identities.set(identityId, updatedIdentity);

  if (status === "REVOKED") {
    revokeSessionsForIdentity(identityId);
  }

  if (isDbConnected()) {
    const updated = await identityRepository.updateStatus(identityId, status);
    if (updated) {
      identities.set(identityId, updated);
      return updated;
    }
  }

  return updatedIdentity;
}

export function assignRole(identityId: string, role: string): Identity {
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

  if (isDbConnected()) {
    void identityRepository.addRole(identityId, normalizedRole).catch((err) => {
      console.error("Failed to add role in MongoDB:", err);
    });
    void policyRepository.assignIdentity(normalizedRole, identityId).catch((err) => {
      console.error("Failed to assign identity to policy in MongoDB:", err);
    });
  }

  return updatedIdentity;
}

export async function assignRoleAsync(identityId: string, role: string): Promise<Identity> {
  const identity = await getIdentityAsync(identityId);
  const normalizedRole = role.trim();
  if (!normalizedRole) {
    throw new AppError("Role is required.", 400, "IDENTITY_INVALID_ROLE");
  }

  if (identity.roles.includes(normalizedRole)) {
    return identity;
  }

  const updatedIdentity = { ...identity, roles: [...identity.roles, normalizedRole], updatedAt: new Date().toISOString() };
  identities.set(identityId, updatedIdentity);

  if (isDbConnected()) {
    await Promise.all([
      identityRepository.addRole(identityId, normalizedRole),
      policyRepository.assignIdentity(normalizedRole, identityId),
    ]);
  }

  return updatedIdentity;
}

export function removeRole(identityId: string, role: string): Identity {
  const identity = getIdentity(identityId);
  const normalizedRole = role.trim();
  const updatedIdentity = {
    ...identity,
    roles: identity.roles.filter((assignedRole) => assignedRole !== normalizedRole),
    updatedAt: new Date().toISOString(),
  };
  identities.set(identityId, updatedIdentity);

  if (isDbConnected()) {
    void identityRepository.removeRole(identityId, normalizedRole).catch((err) => {
      console.error("Failed to remove role in MongoDB:", err);
    });
    void policyRepository.removeIdentity(normalizedRole, identityId).catch((err) => {
      console.error("Failed to remove identity from policy in MongoDB:", err);
    });
  }

  return updatedIdentity;
}

export async function removeRoleAsync(identityId: string, role: string): Promise<Identity> {
  const identity = await getIdentityAsync(identityId);
  const normalizedRole = role.trim();
  if (normalizedRole === "admin" && identity.status === "ACTIVE" && identity.roles.includes("admin")) {
    const activeAdmins = (await listIdentitiesAsync()).filter((candidate) =>
      candidate.status === "ACTIVE" && candidate.roles.includes("admin"));
    if (activeAdmins.length <= 1) {
      throw new AppError("The last active administrator cannot lose the admin role.", 409, "IDENTITY_LAST_ADMIN");
    }
  }
  const updatedIdentity = {
    ...identity,
    roles: identity.roles.filter((assignedRole) => assignedRole !== normalizedRole),
    updatedAt: new Date().toISOString(),
  };
  identities.set(identityId, updatedIdentity);

  if (isDbConnected()) {
    await Promise.all([
      identityRepository.removeRole(identityId, normalizedRole),
      policyRepository.removeIdentity(normalizedRole, identityId),
    ]);
  }

  return updatedIdentity;
}

export function resetIdentityMemoryStore() {
  identities.clear();
}

export function clearIdentityStore() {
  identities.clear();
  if (isDbConnected()) {
    void identityRepository.clear().catch((err) => {
      console.error("Failed to clear identities in MongoDB:", err);
    });
  }
}

export async function rehydrateIdentityStore(): Promise<void> {
  if (isDbConnected()) {
    const stored = await identityRepository.list();
    identities.clear();
    for (const item of stored) {
      identities.set(item.identityId, item);
    }
  }
}

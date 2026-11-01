import mongoose from "mongoose";
import { AppError } from "../../middleware/AppError.js";
import { getIdentity } from "../identity.service.js";
import { getActiveSession, hashToken } from "../session.service.js";
import { getActiveDevice, getDevice } from "../device.service.js";
import { hasPermission, getPermissionsForRoles } from "./authorization.service.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import {
  evaluateContextRules,
  type RequestContext,
  type ContextEvaluationResult,
} from "./context-engine.js";
import {
  BlockchainSyncStateModel,
  DeviceModel,
  IdentityModel,
  PolicyModel,
  SessionModel,
} from "../../models/index.js";
import { BlockchainClient, blockchainPermissionId } from "../../blockchain/client.js";
import { hasBlockchainConfiguration, loadBlockchainConfig } from "../../blockchain/config.js";
import { verifyDeviceProof } from "../device-proof.service.js";

function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export interface ZeroTrustAuthorizationInput {
  accessToken: string;
  resource: string;
  action: string;
  context?: RequestContext;
  clientOverride?: BlockchainClient | null;
}

export interface ZeroTrustAuthorizationResult {
  allowed: boolean;
  identityId: string;
  sessionId: string;
  deviceId: string;
  resource: string;
  action: string;
  contextEvaluation: ContextEvaluationResult;
}

const MAX_SYNC_STALENESS_MS = 60 * 1000; // 60 seconds

/**
 * Checks whether the local blockchain sync state is sufficiently fresh.
 */
export async function isBlockchainSyncFresh(maxStalenessMs = MAX_SYNC_STALENESS_MS): Promise<boolean> {
  if (!hasBlockchainConfiguration()) {
    return true; // Not configured or in memory mode
  }
  if (!isDbConnected()) return false;

  const syncStates = await BlockchainSyncStateModel.find();
  if (syncStates.length === 0) {
    return false;
  }

  const now = Date.now();
  for (const state of syncStates) {
    const lastSyncTime = state.lastSyncTimestamp ? new Date(state.lastSyncTimestamp).getTime() : 0;
    if (now - lastSyncTime > maxStalenessMs) {
      return false;
    }
  }

  return true;
}

/**
 * Authoritative on-chain check to ensure no revoked identity or device gains access.
 */
async function verifyAuthoritativeBlockchainRevocation(
  identityId: string,
  deviceId: string,
  permissionId: string,
  client?: BlockchainClient | null
): Promise<{ identityRevoked: boolean; deviceRevoked: boolean; permissionRevoked: boolean }> {
  let activeClient = client;

  if (!activeClient && hasBlockchainConfiguration()) {
    const config = loadBlockchainConfig();
    activeClient = await BlockchainClient.connect(config);
  }

  if (!activeClient) {
    return { identityRevoked: false, deviceRevoked: false, permissionRevoked: false };
  }

  const [identityRevoked, deviceRevoked, permissionRevoked] = await Promise.all([
    activeClient.isIdentityRevoked(identityId),
    activeClient.isDeviceRevoked(deviceId),
    typeof activeClient.isPermissionRevoked === "function"
      ? activeClient.isPermissionRevoked(permissionId)
      : Promise.resolve(false),
  ]);

  return { identityRevoked, deviceRevoked, permissionRevoked };
}

/**
 * Comprehensive Zero Trust Authorization Pipeline:
 * Session -> Identity -> Device -> Role -> Permission -> Resource -> Action -> Context -> On-Chain Authoritative Check
 */
export async function evaluateZeroTrustAuthorization(
  input: ZeroTrustAuthorizationInput
): Promise<ZeroTrustAuthorizationResult> {
  const { accessToken, resource, action, context = {}, clientOverride } = input;
  const now = context.timestamp ?? new Date();

  // 1. Session Validation
  if (!accessToken || !accessToken.trim()) {
    throw new AppError("A bearer access token is required.", 401, "SESSION_MISSING");
  }

  let session: { sessionId: string; identityId: string; deviceId: string | null; expiresAt: string; status: string; createdAt?: string | Date };
  try {
    session = getActiveSession(accessToken, now);
  } catch (error) {
    if (error instanceof AppError && (error.code !== "SESSION_INVALID" || (error.details as { revoked?: boolean } | undefined)?.revoked)) {
      throw error;
    }
    if (isDbConnected()) {
      // Check MongoDB session repository as fallback
      const sessionDoc = await SessionModel.findOne({
        tokenHash: hashToken(accessToken),
        status: "ACTIVE",
        expiresAt: { $gt: now },
      }).exec();
      if (!sessionDoc) throw error;
      session = {
        sessionId: sessionDoc.sessionId,
        identityId: sessionDoc.identityId,
        deviceId: sessionDoc.deviceId ?? null,
        expiresAt: sessionDoc.expiresAt.toISOString(),
        status: sessionDoc.status,
        createdAt: sessionDoc.createdAt,
      };
    } else {
      throw error;
    }
  }

  if (session.status !== "ACTIVE") {
    throw new AppError("The session is revoked.", 401, "SESSION_REVOKED");
  }

  if (new Date(session.expiresAt) <= now) {
    throw new AppError("The session has expired.", 401, "SESSION_EXPIRED");
  }

  // 2. Identity Validation
  const identity = getIdentity(session.identityId);
  if (!identity) {
    throw new AppError("Identity not found.", 404, "IDENTITY_NOT_FOUND");
  }

  if (identity.status !== "ACTIVE") {
    throw new AppError("The identity is revoked.", 403, "AUTH_IDENTITY_REVOKED");
  }

  // 3. Device Validation (Mandatory Zero Trust hardware boundary)
  if (!session.deviceId) {
    throw new AppError("An enrolled device is required.", 403, "DEVICE_REQUIRED");
  }

  const device = getActiveDevice(session.deviceId, identity.identityId);
  if (!device) {
    throw new AppError("Device not found or not active.", 403, "DEVICE_NOT_FOUND");
  }

  if (device.identityId !== identity.identityId) {
    throw new AppError("Device does not belong to the authenticated identity.", 403, "DEVICE_IDENTITY_MISMATCH");
  }

  if (device.status !== "ACTIVE") {
    throw new AppError("The device is revoked.", 403, "DEVICE_REVOKED");
  }
  if (device.approvalStatus === "PENDING") {
    throw new AppError("The device is awaiting administrator approval.", 403, "DEVICE_PENDING_APPROVAL");
  }
  if (device.publicKey) {
    if (!context.deviceProofTimestamp || !context.deviceProofSignature || !context.requestMethod || !context.requestPath) {
      throw new AppError("A signed device proof is required.", 403, "DEVICE_PROOF_REQUIRED");
    }
    verifyDeviceProof({
      deviceId: device.deviceId,
      sessionId: session.sessionId,
      timestamp: context.deviceProofTimestamp,
      method: context.requestMethod,
      path: context.requestPath,
      signature: context.deviceProofSignature,
      publicKey: device.publicKey,
      now,
    });
  }

  // 4. Role and Permission Validation (Granular resource:action check)
  const permission = `${resource.trim()}:${action.trim()}`;
  const allowed = hasPermission(identity.identityId, resource, action)
    && (device.permissions.length === 0 || device.permissions.includes(permission));

  if (!allowed) {
    recordAuditEvent({
      eventType: "ACCESS_DECISION",
      identityId: identity.identityId,
      deviceId: device.deviceId,
      resource,
      action,
      outcome: "DENIED",
      reason: `The device is not granted ${permission} permission.`,
      actor: identity.walletAddress,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    }, now);

    throw new AppError("Access denied.", 403, "AUTHORIZATION_DENIED", { resource, action });
  }

  // 5. Context-Aware Rule Evaluation (IP reputation, session age, rapid request patterns, device inactivity)
  const fullContext: RequestContext = {
    ...context,
    timestamp: now,
    sessionCreatedAt: context.sessionCreatedAt ?? session.createdAt,
    deviceLastSeenAt: context.deviceLastSeenAt ?? device.lastSeenAt,
    sessionId: session.sessionId,
  };

  const contextResult = evaluateContextRules(fullContext);
  if (contextResult.decision === "DENY") {
    recordAuditEvent({
      eventType: "ACCESS_DECISION",
      identityId: identity.identityId,
      deviceId: device.deviceId,
      resource,
      action,
      outcome: "DENIED",
      reason: `Context evaluation denied access: ${contextResult.reasons.join("; ")}`,
      actor: identity.walletAddress,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    }, now);

    throw new AppError(
      `Access denied by Zero Trust context policy: ${contextResult.reasons.join(", ")}`,
      403,
      "CONTEXT_POLICY_DENIED",
      { contextResult }
    );
  }

  // 6. Blockchain Authoritative Fast-Path Revocation Check
  // Guarantee: Never allow a known revoked identity or device to gain access due to stale cache
  const syncFresh = await isBlockchainSyncFresh();
  if (!syncFresh || clientOverride) {
    let authoritativeState: Awaited<ReturnType<typeof verifyAuthoritativeBlockchainRevocation>>;
    try {
      authoritativeState = await verifyAuthoritativeBlockchainRevocation(
        identity.identityId,
        device.deviceId,
        blockchainPermissionId(resource, action),
        clientOverride,
      );
    } catch {
      recordAuditEvent({
        eventType: "BLOCKCHAIN_SYNC_FAILURE",
        identityId: identity.identityId,
        deviceId: device.deviceId,
        resource,
        action,
        outcome: "DENIED",
        reason: "Blockchain trust state could not be verified.",
        actor: identity.walletAddress,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      }, now);
      throw new AppError("Blockchain trust state is unavailable; access is denied.", 503, "BLOCKCHAIN_TRUST_UNAVAILABLE");
    }

    const { identityRevoked, deviceRevoked, permissionRevoked } = authoritativeState;

    if (identityRevoked) {
      recordAuditEvent({
        eventType: "ACCESS_DECISION",
        identityId: identity.identityId,
        deviceId: device.deviceId,
        resource,
        action,
        outcome: "DENIED",
        reason: "Authoritative blockchain state confirms identity is revoked.",
        actor: identity.walletAddress,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      }, now);
      throw new AppError("Identity is revoked on blockchain.", 403, "AUTH_IDENTITY_REVOKED");
    }

    if (deviceRevoked) {
      recordAuditEvent({
        eventType: "ACCESS_DECISION",
        identityId: identity.identityId,
        deviceId: device.deviceId,
        resource,
        action,
        outcome: "DENIED",
        reason: "Authoritative blockchain state confirms device is revoked.",
        actor: identity.walletAddress,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      }, now);
      throw new AppError("Device is revoked on blockchain.", 403, "DEVICE_REVOKED");
    }

    if (permissionRevoked) {
      recordAuditEvent({
        eventType: "ACCESS_DECISION",
        identityId: identity.identityId,
        deviceId: device.deviceId,
        resource,
        action,
        outcome: "DENIED",
        reason: "Authoritative blockchain state confirms permission is revoked.",
        actor: identity.walletAddress,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      }, now);
      throw new AppError("Permission is revoked on blockchain.", 403, "PERMISSION_REVOKED");
    }
  }

  // 7. Success: Log ALLOWED Access Decision and Return Validated Result
  recordAuditEvent({
    eventType: "ACCESS_DECISION",
    identityId: identity.identityId,
    deviceId: device.deviceId,
    resource,
    action,
    outcome: "ALLOWED",
    reason: contextResult.decision === "REVIEW_REQUIRED" ? "Allowed with anomaly review flag." : null,
    actor: identity.walletAddress,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  }, now);

  return {
    allowed: true,
    identityId: identity.identityId,
    sessionId: session.sessionId,
    deviceId: device.deviceId,
    resource,
    action,
    contextEvaluation: contextResult,
  };
}
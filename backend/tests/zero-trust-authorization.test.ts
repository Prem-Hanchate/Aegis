import { beforeEach, describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import { clearChallengeStore } from "../src/services/auth/challengeStore.js";
import { clearAuditEvents, listAuditEvents } from "../src/services/audit/audit.service.js";
import {
  assignRole,
  clearIdentityStore,
  registerIdentity,
  updateIdentityStatus,
} from "../src/services/identity.service.js";
import {
  clearSessionStore,
  createSession,
  attachDeviceToSession,
  revokeSession,
} from "../src/services/session.service.js";
import {
  clearDeviceStore,
  enrollDevice,
  revokeDevice,
} from "../src/services/device.service.js";
import {
  clearAuthorizationState,
  grantRolePermission,
} from "../src/services/authorization/authorization.service.js";
import {
  evaluateZeroTrustAuthorization,
} from "../src/services/authorization/zero-trust.service.js";
import {
  configureContextRules,
  resetContextRules,
} from "../src/services/authorization/context-engine.js";

describe("PHASE 3 — Blockchain-Backed Zero Trust Authorization Engine", () => {
  beforeEach(() => {
    clearChallengeStore();
    clearIdentityStore();
    clearSessionStore();
    clearDeviceStore();
    clearAuthorizationState();
    clearAuditEvents();
    resetContextRules();
  });

  function setupAuthenticatedEnvironment(role = "employee") {
    const wallet = Wallet.createRandom();
    const identity = registerIdentity(wallet.address, "Alice User");
    assignRole(identity.identityId, role);

    const { session, accessToken } = createSession(identity.identityId);
    const device = enrollDevice(
      identity.identityId,
      session.sessionId,
      "Corporate MacBook",
      "fingerprint-secure-hw-001"
    );

    return {
      wallet,
      identity,
      session,
      accessToken,
      device,
    };
  }

  describe("1. Identity Validation", () => {
    it("allows access for active, registered identities", async () => {
      const { accessToken } = setupAuthenticatedEnvironment("employee");

      const result = await evaluateZeroTrustAuthorization({
        accessToken,
        resource: "employee",
        action: "read",
      });

      expect(result.allowed).toBe(true);
      expect(result.resource).toBe("employee");
      expect(result.action).toBe("read");
    });

    it("rejects access immediately if identity is revoked", async () => {
      const { accessToken, identity } = setupAuthenticatedEnvironment("employee");
      updateIdentityStatus(identity.identityId, "REVOKED");

      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "employee",
          action: "read",
        })
      ).rejects.toThrow(/revoked/i);
    });
  });

  describe("2. Session Validation", () => {
    it("rejects missing or empty access token", async () => {
      await expect(
        evaluateZeroTrustAuthorization({
          accessToken: "",
          resource: "employee",
          action: "read",
        })
      ).rejects.toThrow("A bearer access token is required.");
    });

    it("rejects access if session has been revoked", async () => {
      const { accessToken } = setupAuthenticatedEnvironment("employee");
      revokeSession(accessToken);

      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "employee",
          action: "read",
        })
      ).rejects.toThrow(/revoked/i);
    });

    it("rejects access if session has expired", async () => {
      const { accessToken } = setupAuthenticatedEnvironment("employee");
      // 50 minutes in the future exceeds the 45-minute TTL
      const futureTime = new Date(Date.now() + 50 * 60 * 1000);

      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "employee",
          action: "read",
          context: { timestamp: futureTime },
        })
      ).rejects.toThrow(/expired/i);
    });
  });

  describe("3. Device Validation (Zero Trust Hardware Boundary)", () => {
    it("rejects access if session is not bound to an enrolled device", async () => {
      const wallet = Wallet.createRandom();
      const identity = registerIdentity(wallet.address, "No Device User");
      assignRole(identity.identityId, "employee");
      const { accessToken } = createSession(identity.identityId);

      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "employee",
          action: "read",
        })
      ).rejects.toThrow("An enrolled device is required.");
    });

    it("rejects access if the bound device is revoked", async () => {
      const { accessToken, device, identity } = setupAuthenticatedEnvironment("employee");
      revokeDevice(device.deviceId, identity.identityId);

      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "employee",
          action: "read",
        })
      ).rejects.toThrow("The device is revoked.");
    });

    it("rejects access if device belongs to a different identity", async () => {
      const { accessToken, session } = setupAuthenticatedEnvironment("employee");
      const attackerWallet = Wallet.createRandom();
      const attacker = registerIdentity(attackerWallet.address, "Bob Attacker");
      const { session: attackerSession } = createSession(attacker.identityId);
      const attackerDevice = enrollDevice(attacker.identityId, attackerSession.sessionId, "Hacker Pad", "fp-evil");

      // Attempt to bind attacker's device to victim's session
      attachDeviceToSession(session.sessionId, attackerDevice.deviceId);

      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "employee",
          action: "read",
        })
      ).rejects.toThrow(/does not belong to this identity/i);
    });
  });

  describe("4. Role and Granular Permission Validation", () => {
    it("allows employee role to read employee and reports, but denies payroll", async () => {
      const { accessToken } = setupAuthenticatedEnvironment("employee");

      const employeeAccess = await evaluateZeroTrustAuthorization({
        accessToken,
        resource: "employee",
        action: "read",
      });
      expect(employeeAccess.allowed).toBe(true);

      const reportsAccess = await evaluateZeroTrustAuthorization({
        accessToken,
        resource: "reports",
        action: "read",
      });
      expect(reportsAccess.allowed).toBe(true);

      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "payroll",
          action: "read",
        })
      ).rejects.toThrow("Access denied.");
    });

    it("allows manager role to read payroll", async () => {
      const { accessToken } = setupAuthenticatedEnvironment("manager");

      const payrollAccess = await evaluateZeroTrustAuthorization({
        accessToken,
        resource: "payroll",
        action: "read",
      });
      expect(payrollAccess.allowed).toBe(true);
    });

    it("allows admin role to access policy management", async () => {
      const { accessToken } = setupAuthenticatedEnvironment("admin");

      const policyAccess = await evaluateZeroTrustAuthorization({
        accessToken,
        resource: "policies",
        action: "manage",
      });
      expect(policyAccess.allowed).toBe(true);
    });

    it("dynamically reflects granted role permissions", async () => {
      const { accessToken } = setupAuthenticatedEnvironment("employee");

      // Employee cannot manage policies by default
      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "policies",
          action: "manage",
        })
      ).rejects.toThrow("Access denied.");

      // Admin grants policies:manage to employee role
      grantRolePermission("employee", "policies", "manage");

      // Now employee is authorized!
      const result = await evaluateZeroTrustAuthorization({
        accessToken,
        resource: "policies",
        action: "manage",
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe("5. Context-Aware Zero Trust Evaluation", () => {
    it("denies access if request originates from a blocked network IP", async () => {
      const { accessToken } = setupAuthenticatedEnvironment("employee");
      configureContextRules({ blockedIps: new Set(["203.0.113.50"]) });

      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "employee",
          action: "read",
          context: { ipAddress: "203.0.113.50" },
        })
      ).rejects.toThrow(/Zero Trust context policy/);

      // Audit event should record DENIED outcome with context reason
      const events = listAuditEvents({ outcome: "DENIED" }).events;
      expect(events.some((e) => e.reason?.includes("Context evaluation denied access"))).toBe(true);
    });

    it("denies access if session duration exceeds maximum allowable Zero Trust duration", async () => {
      const { accessToken } = setupAuthenticatedEnvironment("employee");
      configureContextRules({ maxSessionAgeMs: 10 * 60 * 1000 }); // 10 min max

      const oldCreationTime = new Date(Date.now() - 12 * 60 * 1000); // 12 mins ago

      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "employee",
          action: "read",
          context: {
            sessionCreatedAt: oldCreationTime,
            timestamp: new Date(),
          },
        })
      ).rejects.toThrow(/Session has exceeded maximum allowable Zero Trust duration/);
    });

    it("flags rapid burst requests with REVIEW_REQUIRED anomaly while allowing legitimate access", async () => {
      const { accessToken } = setupAuthenticatedEnvironment("employee");
      configureContextRules({ maxRequestsPerWindow: 5, rateLimitWindowMs: 5000 });

      // First 5 requests pass cleanly
      for (let i = 0; i < 5; i++) {
        const res = await evaluateZeroTrustAuthorization({
          accessToken,
          resource: "employee",
          action: "read",
          context: { ipAddress: "10.0.0.1" },
        });
        expect(res.allowed).toBe(true);
        expect(res.contextEvaluation.decision).toBe("ALLOW");
      }

      // 6th request triggers REVIEW_REQUIRED
      const res6 = await evaluateZeroTrustAuthorization({
        accessToken,
        resource: "employee",
        action: "read",
        context: { ipAddress: "10.0.0.1" },
      });
      expect(res6.allowed).toBe(true);
      expect(res6.contextEvaluation.decision).toBe("REVIEW_REQUIRED");

      const audits = listAuditEvents({}).events;
      expect(audits.some((a) => a.reason?.includes("anomaly review flag"))).toBe(true);
    });
  });

  describe("6. Authoritative Blockchain Revocation Guard", () => {
    it("authoritatively denies access if identity is revoked on blockchain despite local cache", async () => {
      const { accessToken, identity } = setupAuthenticatedEnvironment("employee");

      // Mock blockchain client indicating on-chain identity is revoked
      const mockClient = {
        isIdentityRevoked: async (id: string) => id === identity.identityId,
        isDeviceRevoked: async () => false,
      } as any;

      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "employee",
          action: "read",
          clientOverride: mockClient,
        })
      ).rejects.toThrow("Identity is revoked on blockchain.");
    });

    it("authoritatively denies access if device is revoked on blockchain despite local cache", async () => {
      const { accessToken, device } = setupAuthenticatedEnvironment("employee");

      // Mock blockchain client indicating on-chain device is revoked
      const mockClient = {
        isIdentityRevoked: async () => false,
        isDeviceRevoked: async (devId: string) => devId === device.deviceId,
      } as any;

      await expect(
        evaluateZeroTrustAuthorization({
          accessToken,
          resource: "employee",
          action: "read",
          clientOverride: mockClient,
        })
      ).rejects.toThrow("Device is revoked on blockchain.");
    });
  });
});

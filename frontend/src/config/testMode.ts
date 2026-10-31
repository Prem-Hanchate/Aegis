export const isTestMode =
  import.meta.env.DEV && import.meta.env.VITE_AEGIS_TEST_MODE === "true";

export const testModeIdentity = {
  identityId: "test-identity",
  walletAddress: "0x0000000000000000000000000000000000000001",
  displayName: "Aegis Test Operator",
  status: "ACTIVE" as const,
};

export const testModePermissions = [
  "employee:read",
  "reports:read",
  "payroll:read",
  "policies:manage",
];

export function createTestModeSession() {
  return {
    status: "authenticated" as const,
    identity: testModeIdentity,
    session: {
      sessionId: "test-session",
      accessToken: "test-mode-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    deviceId: "test-device",
    roles: ["admin"],
    permissions: testModePermissions,
    errorMessage: null,
  };
}

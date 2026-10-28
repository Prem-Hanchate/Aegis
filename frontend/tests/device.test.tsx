import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeviceManagementPage } from "../src/pages/DeviceManagementPage";
import { useAuthState, type AuthState } from "../src/context/auth";
import {
  bindDevice,
  enrollDevice,
  fetchDevices,
  heartbeatDevice,
  replaceDevice,
  revokeDevice,
  type DeviceSummary,
} from "../src/services/api";
import { ApiError } from "../src/services/auth";

vi.mock("../src/context/auth", () => ({
  useAuthState: vi.fn(),
}));

vi.mock("../src/services/api", () => ({
  fetchDevices: vi.fn(),
  enrollDevice: vi.fn(),
  bindDevice: vi.fn(),
  heartbeatDevice: vi.fn(),
  replaceDevice: vi.fn(),
  revokeDevice: vi.fn(),
}));

const mockActiveDevice: DeviceSummary = {
  deviceId: "dev-active-123456789",
  identityId: "identity-123",
  name: "MacBook Pro Workstation",
  fingerprint: "fp-macbook-pro-2026",
  status: "ACTIVE",
  createdAt: "2026-10-20T10:00:00.000Z",
  lastSeenAt: "2026-10-28T12:00:00.000Z",
};

const mockUnboundActiveDevice: DeviceSummary = {
  deviceId: "dev-unbound-987654321",
  identityId: "identity-123",
  name: "Office Linux Workstation",
  fingerprint: "fp-linux-workstation-88",
  status: "ACTIVE",
  createdAt: "2026-10-22T08:30:00.000Z",
  lastSeenAt: "2026-10-28T11:45:00.000Z",
};

const mockRevokedDevice: DeviceSummary = {
  deviceId: "dev-revoked-555555555",
  identityId: "identity-123",
  name: "Compromised iPhone",
  fingerprint: "fp-iphone-ios-old",
  status: "REVOKED",
  createdAt: "2026-10-15T09:00:00.000Z",
  lastSeenAt: "2026-10-25T14:20:00.000Z",
};

describe("DeviceManagementPage Workflows", () => {
  const setDeviceIdMock = vi.fn();
  const clearSessionMock = vi.fn();

  function setupAuth(deviceId: string | null = "dev-active-123456789") {
    const state: AuthState = {
      status: "authenticated",
      identity: {
        identityId: "identity-123",
        walletAddress: "0x1111111111111111111111111111111111111111",
        displayName: "Alice Operator",
        status: "ACTIVE",
      },
      session: {
        sessionId: "session-abc-123",
        accessToken: "test-access-token-token",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      deviceId,
      roles: ["employee"],
      permissions: [],
      errorMessage: null,
    };

    vi.mocked(useAuthState).mockReturnValue({
      state,
      setState: vi.fn(),
      setSession: vi.fn(),
      setDeviceId: setDeviceIdMock,
      clearSession: clearSessionMock,
      setError: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
    vi.mocked(fetchDevices).mockResolvedValue({
      devices: [mockActiveDevice, mockUnboundActiveDevice, mockRevokedDevice],
    });
  });

  describe("Device Inventory & Zero Trust Posture", () => {
    it("renders device inventory and meaningful metadata", async () => {
      render(<DeviceManagementPage />);

      expect(screen.getByText(/Zero Trust Hardware Posture/i)).toBeInTheDocument();
      expect(screen.getByText(/Why is an enrolled device required\?/i)).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("MacBook Pro Workstation")).toBeInTheDocument();
        expect(screen.getByText("Office Linux Workstation")).toBeInTheDocument();
        expect(screen.getByText("Compromised iPhone")).toBeInTheDocument();
      });

      // Verification of badge for currently bound device
      expect(screen.getByText("BOUND TO CURRENT SESSION")).toBeInTheDocument();
      expect(screen.getByText("fp-macbook-pro-2026")).toBeInTheDocument();
      expect(screen.getByText("fp-linux-workstation-88")).toBeInTheDocument();
      expect(screen.getByText(/Device permanently revoked/i)).toBeInTheDocument();
    });

    it("displays warning posture banner when no device is bound to session", async () => {
      setupAuth(null);
      render(<DeviceManagementPage />);

      await waitFor(() => {
        expect(screen.getByText(/Session Hardware Binding: No Active Device Bound/i)).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Your session is not currently bound to an active device/i),
      ).toBeInTheDocument();
    });

    it("filters devices by status pill tabs", async () => {
      const user = userEvent.setup();
      render(<DeviceManagementPage />);

      await waitFor(() => {
        expect(screen.getByText("MacBook Pro Workstation")).toBeInTheDocument();
      });

      // Filter by Active only
      const activeTab = screen.getByRole("button", { name: /^Active/i });
      await user.click(activeTab);

      expect(screen.getByText("MacBook Pro Workstation")).toBeInTheDocument();
      expect(screen.getByText("Office Linux Workstation")).toBeInTheDocument();
      expect(screen.queryByText("Compromised iPhone")).not.toBeInTheDocument();

      // Filter by Revoked only
      const revokedTab = screen.getByRole("button", { name: /^Revoked/i });
      await user.click(revokedTab);

      expect(screen.queryByText("MacBook Pro Workstation")).not.toBeInTheDocument();
      expect(screen.getByText("Compromised iPhone")).toBeInTheDocument();

      // Filter by All
      const allTab = screen.getByRole("button", { name: /^All/i });
      await user.click(allTab);

      expect(screen.getByText("MacBook Pro Workstation")).toBeInTheDocument();
      expect(screen.getByText("Compromised iPhone")).toBeInTheDocument();
    });
  });

  describe("Device Enrollment & Validation", () => {
    it("validates empty device name and short fingerprint", async () => {
      render(<DeviceManagementPage />);

      const enrollBtn = screen.getByRole("button", { name: /Enroll & Bind Device/i });

      // Trigger empty submission
      fireEvent.click(enrollBtn);

      const nameInput = screen.getByLabelText(/Device Name/i);
      const fpInput = screen.getByLabelText(/Hardware Fingerprint/i);

      // Fill name but invalid short fingerprint
      await userEvent.type(nameInput, "New Test Laptop");
      await userEvent.type(fpInput, "short");
      fireEvent.click(enrollBtn);

      expect(
        screen.getByText(/Device fingerprint must be at least 8 characters/i),
      ).toBeInTheDocument();
      expect(enrollDevice).not.toHaveBeenCalled();
    });

    it("generates browser fingerprint helper populates the field", async () => {
      render(<DeviceManagementPage />);

      const generateBtn = screen.getByRole("button", { name: /Generate Browser Fingerprint/i });
      await userEvent.click(generateBtn);

      const fpInput = screen.getByLabelText(/Hardware Fingerprint/i) as HTMLInputElement;
      expect(fpInput.value).toMatch(/^fp-/);
      expect(fpInput.value.length).toBeGreaterThanOrEqual(8);
    });

    it("enrolls new device, auto-binds to session, and refreshes list", async () => {
      const user = userEvent.setup();
      const newlyEnrolled: DeviceSummary = {
        deviceId: "dev-new-999999",
        identityId: "identity-123",
        name: "Dell XPS Developer",
        fingerprint: "fp-dell-xps-15",
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };

      vi.mocked(enrollDevice).mockResolvedValue({
        status: "enrolled",
        device: newlyEnrolled,
      });

      render(<DeviceManagementPage />);

      const nameInput = screen.getByLabelText(/Device Name/i);
      const fpInput = screen.getByLabelText(/Hardware Fingerprint/i);
      const enrollBtn = screen.getByRole("button", { name: /Enroll & Bind Device/i });

      await user.type(nameInput, "Dell XPS Developer");
      await user.type(fpInput, "fp-dell-xps-15");
      await user.click(enrollBtn);

      expect(enrollDevice).toHaveBeenCalledWith("test-access-token-token", {
        name: "Dell XPS Developer",
        fingerprint: "fp-dell-xps-15",
      });

      expect(setDeviceIdMock).toHaveBeenCalledWith("dev-new-999999");
      expect(
        await screen.findByText(/Device "Dell XPS Developer" enrolled and bound to this session/i),
      ).toBeInTheDocument();

      // Form cleared
      expect(nameInput).toHaveValue("");
      expect(fpInput).toHaveValue("");
    });
  });

  describe("Session-to-Device Binding", () => {
    it("binds an existing active device to the current session", async () => {
      const user = userEvent.setup();
      vi.mocked(bindDevice).mockResolvedValue({
        status: "bound",
        device: mockUnboundActiveDevice,
      });

      render(<DeviceManagementPage />);

      await waitFor(() => {
        expect(screen.getByText("Office Linux Workstation")).toBeInTheDocument();
      });

      // Find the "Bind to Session" button for the unbound device
      const bindBtn = screen.getByRole("button", { name: /Bind to Session/i });
      await user.click(bindBtn);

      expect(bindDevice).toHaveBeenCalledWith(
        "test-access-token-token",
        "dev-unbound-987654321",
      );
      expect(setDeviceIdMock).toHaveBeenCalledWith("dev-unbound-987654321");
      expect(
        await screen.findByText(/Device "Office Linux Workstation" is now bound to your active session/i),
      ).toBeInTheDocument();
    });
  });

  describe("Device Heartbeat", () => {
    it("pings heartbeat and refreshes last seen timestamp", async () => {
      const user = userEvent.setup();
      vi.mocked(heartbeatDevice).mockResolvedValue({
        status: "ok",
        device: {
          ...mockActiveDevice,
          lastSeenAt: "2026-10-28T12:35:00.000Z",
        },
      });

      render(<DeviceManagementPage />);

      await waitFor(() => {
        expect(screen.getByText("MacBook Pro Workstation")).toBeInTheDocument();
      });

      const heartbeatButtons = screen.getAllByRole("button", { name: /Ping Heartbeat/i });
      await user.click(heartbeatButtons[0]);

      expect(heartbeatDevice).toHaveBeenCalledWith(
        "test-access-token-token",
        "dev-active-123456789",
      );
      expect(
        await screen.findByText(/Heartbeat ping confirmed for "MacBook Pro Workstation"/i),
      ).toBeInTheDocument();
    });
  });

  describe("Device Revocation & Security Confirmation", () => {
    it("opens confirmation dialog with consequence warning and cancels safely", async () => {
      const user = userEvent.setup();
      render(<DeviceManagementPage />);

      await waitFor(() => {
        expect(screen.getByText("MacBook Pro Workstation")).toBeInTheDocument();
      });

      const revokeBtns = screen.getAllByRole("button", { name: /^Revoke$/i });
      await user.click(revokeBtns[0]);

      // Revocation Modal visible
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/Confirm Device Revocation/i)).toBeInTheDocument();
      expect(screen.getByText(/Security Consequences:/i)).toBeInTheDocument();
      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();

      // Cancel
      const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
      await user.click(cancelBtn);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(revokeDevice).not.toHaveBeenCalled();
    });

    it("confirms revocation, calls backend, updates session if bound device was revoked", async () => {
      const user = userEvent.setup();
      vi.mocked(revokeDevice).mockResolvedValue({
        device: { ...mockActiveDevice, status: "REVOKED" },
      });

      render(<DeviceManagementPage />);

      await waitFor(() => {
        expect(screen.getByText("MacBook Pro Workstation")).toBeInTheDocument();
      });

      const revokeBtns = screen.getAllByRole("button", { name: /^Revoke$/i });
      await user.click(revokeBtns[0]);

      const confirmBtn = screen.getByRole("button", { name: /Yes, Revoke Device/i });
      await user.click(confirmBtn);

      expect(revokeDevice).toHaveBeenCalledWith(
        "test-access-token-token",
        "dev-active-123456789",
      );
      // Since this was the currently bound device, setDeviceId(null) should have been triggered
      expect(setDeviceIdMock).toHaveBeenCalledWith(null);
      expect(
        await screen.findByText(/Device "MacBook Pro Workstation" was successfully revoked/i),
      ).toBeInTheDocument();
    });
  });

  describe("Device Replacement Workflow", () => {
    it("opens replacement modal, generates fingerprint, and replaces device", async () => {
      const user = userEvent.setup();
      const replacementDevice: DeviceSummary = {
        deviceId: "dev-replaced-777",
        identityId: "identity-123",
        name: "MacBook Pro M4 (Replaced)",
        fingerprint: "fp-m4-hardware-2026",
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };

      vi.mocked(replaceDevice).mockResolvedValue({
        device: replacementDevice,
      });

      render(<DeviceManagementPage />);

      await waitFor(() => {
        expect(screen.getByText("MacBook Pro Workstation")).toBeInTheDocument();
      });

      const replaceBtns = screen.getAllByRole("button", { name: /^Replace$/i });
      await user.click(replaceBtns[0]);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        screen.getByText(/Replace Device: MacBook Pro Workstation/i),
      ).toBeInTheDocument();

      const nameInput = screen.getByLabelText(/New Device Name/i);
      const fpInput = screen.getByLabelText(/New Hardware Fingerprint/i);

      await user.clear(nameInput);
      await user.type(nameInput, "MacBook Pro M4 (Replaced)");
      await user.clear(fpInput);
      await user.type(fpInput, "fp-m4-hardware-2026");

      const submitBtn = screen.getByRole("button", { name: /Confirm Replacement/i });
      await user.click(submitBtn);

      expect(replaceDevice).toHaveBeenCalledWith(
        "test-access-token-token",
        "dev-active-123456789",
        {
          name: "MacBook Pro M4 (Replaced)",
          fingerprint: "fp-m4-hardware-2026",
        },
      );

      expect(setDeviceIdMock).toHaveBeenCalledWith("dev-replaced-777");
      expect(
        await screen.findByText(
          /Device replaced\. New device "MacBook Pro M4 \(Replaced\)" is active and bound\./i,
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Error Handling & Edge Cases", () => {
    it("handles ownership violation error (DEVICE_IDENTITY_MISMATCH)", async () => {
      const user = userEvent.setup();
      vi.mocked(bindDevice).mockRejectedValue(
        new ApiError("You do not have permission to bind this device.", 403, "DEVICE_IDENTITY_MISMATCH"),
      );

      render(<DeviceManagementPage />);

      await waitFor(() => {
        expect(screen.getByText("Office Linux Workstation")).toBeInTheDocument();
      });

      const bindBtn = screen.getByRole("button", { name: /Bind to Session/i });
      await user.click(bindBtn);

      expect(
        await screen.findByText(/You do not have permission to bind this device/i),
      ).toBeInTheDocument();
    });

    it("handles expired session by clearing session state and prompting re-login", async () => {
      const user = userEvent.setup();
      vi.mocked(fetchDevices).mockRejectedValue(
        new ApiError("Session has expired", 401, "SESSION_EXPIRED"),
      );

      render(<DeviceManagementPage />);

      await waitFor(() => {
        expect(clearSessionMock).toHaveBeenCalledWith(
          "Your session has expired. Please log in again.",
        );
      });
    });

    it("handles network failure gracefully", async () => {
      const user = userEvent.setup();
      vi.mocked(bindDevice).mockRejectedValue(new Error("Network connection dropped."));

      render(<DeviceManagementPage />);

      await waitFor(() => {
        expect(screen.getByText("Office Linux Workstation")).toBeInTheDocument();
      });

      const bindBtn = screen.getByRole("button", { name: /Bind to Session/i });
      await user.click(bindBtn);

      expect(await screen.findByText(/Network connection dropped/i)).toBeInTheDocument();
    });
  });
});

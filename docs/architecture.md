# Architecture

Aegis is an account and device-authenticated Zero Trust access controller. A
wallet can authenticate the human identity during initial enrollment, while a
device-held elliptic-curve key authenticates the client device afterward.
Pairing creates a pending device and an administrator must approve it before
the device can establish a session or use protected resources. Approved
devices can log in with one-time signed challenges without MetaMask, inherit
the identity's permissions, or use an explicit narrower permission list.
Protected requests include a short-lived signed device proof; revocation
denies subsequent access.

- `frontend/` - React UI shell with routing and backend connectivity
- `backend/` - Express API with shared middleware, environment config, and health checks
- `contracts/` - Hardhat workspace for Solidity contracts and tests

The device boundary controls access to Aegis-integrated APIs. It is not an
operating-system MDM, endpoint lock, hardware controller, or remote command
system.

The remaining production work is integration hardening: making MongoDB authoritative across all services, validating runtime blockchain listener/reconciliation orchestration, enforcing the configured fail-closed trust policy, completing audit anchoring diagnostics, and proving the complete deployment flow.

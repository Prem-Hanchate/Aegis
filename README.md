# Aegis

Decentralized Identity & Zero Trust Access Controller.

Project instructions for AI-assisted changes are in [copilot-instructions.md](copilot-instructions.md).

This repository is organized as a monorepo with three workspaces:

- `frontend/` - React + TypeScript user and admin interface (Vite)
- `backend/` - Node.js + Express + TypeScript API
- `contracts/` - Hardhat + Solidity smart contracts

---

## Requirements

- **Node.js**: 20 or newer
- **npm**: 10 or newer
- **MetaMask**: Browser extension with a development Ethereum wallet account
- **MongoDB**: Standalone or Docker (`docker compose up mongo`) for backend readiness
- **Ethereum RPC Node**: Hardhat local node (`npx hardhat node` in `contracts/`) or compatible testnet

---

## Setup & Running Locally

1. Install dependencies across all workspaces:

```bash
npm install
```

2. Start the backend development server:

```bash
npm run dev:backend
```

The backend binds to `0.0.0.0:4000` by default (configurable via `HOST` and `PORT` in
`backend/.env`), so other devices can reach the host on its LAN address.

3. Start the frontend development server:

```bash
npm run dev:frontend
```

The frontend is bound to `0.0.0.0:5173` in development. For shared LAN access,
open `http://<host-lan-ip>:5173` on each device. `Start.ps1` detects the host LAN
address and sets backend `FRONTEND_ORIGIN` and `AUTH_DOMAIN` to that browser
origin/host. Allow inbound TCP 5173 in the host firewall (and TCP 4000 only when
clients call the backend directly). For Windows PowerShell, run as Administrator:
`New-NetFirewallRule -DisplayName "Aegis Frontend 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow`.
Keep `VITE_API_BASE_URL=/api` with the Vite proxy; for a separately
hosted frontend use `VITE_API_BASE_URL=http://<host-lan-ip>:4000/api`. Do not use
`localhost` in a remote browser's API URL. All clients share MongoDB but keep separate
bearer sessions. Use HTTPS in production (or a trusted local development origin) for
wallet/browser compatibility.

4. Run all automated tests:

```bash
npm test
```

Or test individual workspaces:

```bash
npm test -w frontend
npm test -w backend
npm test -w contracts
```

5. Build all packages for production:

```bash
npm run build
```

---

## Phase 1 Implementation: Wallet Authentication & Authenticated Frontend

### Login Flow

1. **MetaMask Detection**: When visiting `/login`, the frontend detects whether `window.ethereum` is available. If missing, an actionable installation warning is displayed.
2. **Account Connection**: Clicking **"Connect Wallet & Sign In"** triggers `eth_requestAccounts` to retrieve the active account.
3. **Challenge Request**: The frontend calls `POST /api/auth/challenge` with the normalized wallet address. The backend issues a single-use, domain-bound (`aegis.zerotrust.local`) nonce valid for 5 minutes.
4. **Cryptographic Signing**: The user reviews the authentication context and confirms `personal_sign` in MetaMask.
5. **Signature Verification**: The signature is posted to `POST /api/auth/verify`. The backend recovers the signer using `ethers.verifyMessage`, verifies the active registered identity, atomically invalidates the nonce to prevent replay attacks, and issues a hashed, MongoDB-persisted 15-minute bearer session.
6. **Session & Protected Workspace**: The client establishes the authenticated session in React state and redirects to the protected Dashboard (`/`).
7. **Sign Out**: Clicking **"Sign out"** invokes `POST /api/auth/logout` to revoke the token on the backend and resets the in-memory state.
8. **Account Switching Protection**: Listening to `accountsChanged` in MetaMask ensures that if the user switches active accounts in their wallet, the current session is immediately invalidated to prevent mismatched identity actions.

---

## Phase 2 Implementation: Device Management Dashboard & Zero Trust Hardware Posture

### Device Management Lifecycle (`/devices`)

1. **Zero Trust Hardware Boundary**: In Aegis Zero Trust, wallet identity authentication alone is insufficient. Accessing protected corporate endpoints (`/api/resources/employee`, `/reports`, `/payroll`) strictly mandates an active, registered device bound to the current session (`auth.deviceId`).
2. **Device Inventory & Status Filters**: Authenticated users can inspect their hardware inventory, filtering by `All`, `Active`, or `Revoked` status. Meaningful details including the device identifier, hardware fingerprint, enrollment date, and last seen timestamp are displayed.
3. **Session-to-Device Binding**:
   - Newly enrolled devices and replacement devices are automatically bound to the active session.
   - For existing active devices, users can explicitly bind hardware to their current session via `POST /api/devices/:deviceId/bind`.
   - The UI features a dynamic Session Posture Banner highlighting whether the session is **Bound & Active** or in **No Active Device Bound** warning posture.
4. **Device Enrollment**: Authenticated users register new hardware using the enrollment form, with input validation and a client-side browser fingerprint generator.
5. **Device Replacement**: Allows seamlessly rotating hardware. The user specifies replacement credentials in a modal; the backend atomically revokes the old device on-chain/in-memory, registers the new device, and binds it to the current session.
6. **Device Revocation**: Includes a confirmation dialog explicitly detailing the security consequences: immediate and permanent `REVOKED` status, revocation on blockchain, and rejection of all sessions bound to that device with `DEVICE_REVOKED` (403).
7. **Heartbeat Monitoring**: Active devices can dispatch heartbeats (`POST /api/devices/:deviceId/heartbeat`) to update their `lastSeenAt` telemetry.
8. **Server-Side Security Enforcement**:
   - Device ownership is strictly validated server-side for all endpoints (`bind`, `revoke`, `replace`, `heartbeat`). A caller cannot hijack or revoke another identity's device by changing an identifier (rejected with `DEVICE_IDENTITY_MISMATCH` / 403).
   - Only active, unrevoked devices owned by the caller can be bound to a session (`DEVICE_REVOKED` / 400).
   - Revocation verifies device ownership and active status *before* initiating blockchain writes, preventing unauthorized gas expenditures or falsified revocation records.

---

## Zero Trust Evaluation & Endpoints

- **Public Gateways**:
  - `GET /api/health`: Operational backend diagnostics
  - `POST /api/auth/challenge`: Nonce challenge generation
  - `POST /api/auth/verify`: Cryptographic verification and session issuance
- **Authenticated Identity & Session Endpoints**:
  - `POST /api/auth/logout`: Revokes active bearer session
  - `GET /api/auth/me`: Session and identity introspection
  - `POST /api/auth/sessions/revoke-all`: Emergency invalidation of all sessions for identity
- **Zero Trust Device Management Endpoints**:
  - `GET /api/devices`: Lists enrolled hardware belonging to the caller's identity
  - `POST /api/devices`: Enrolls a new device and auto-binds to current session
  - `POST /api/devices/:deviceId/bind`: Binds an existing active device to current session
  - `POST /api/devices/:deviceId/heartbeat`: Updates device last-seen timestamp
  - `POST /api/devices/:deviceId/replace`: Replaces an old device with a new one
  - `PATCH /api/devices/:deviceId/revoke`: Permanently revokes a device
- **Protected Resources**:
  - `GET /api/resources/:resource`: Policy-evaluated resource access (`employee`, `reports`, `payroll`), requiring both valid role permissions and an active bound device.

## Identity Administration

Identity administration is available at `/identities` to authenticated users with the effective
`policies:manage` permission. The interface supports wallet-validated registration, directory
search/status filters, identity details, profile updates, activation, revocation, and role
assignment/removal. Revocation invalidates active sessions and prevents subsequent wallet
authentication.

Identity management endpoints are administrative server-side operations. Identity creation and
wallet lookup are not public endpoints; ordinary users cannot use them or change roles. Administrators
cannot change their own roles, preventing self-escalation. Registration and activation wait for
optional blockchain writes; revocation blocks application access immediately and reports blockchain
synchronization failures rather than silently treating them as successful chain updates.

The configured bootstrap administrator defaults to
`0xfe2400b9A20f2A3C824D8D46c68046b0264c6253`. The server registers or reactivates
that wallet as an `admin` identity at startup, allowing that wallet to log in and manage
identities without a separate permission setup. Override `BOOTSTRAP_ADMIN_WALLET` for
another administrator. This is a development convenience; never use a shared bootstrap
wallet in production unless it is explicitly controlled and protected.
If that configured development identity was revoked, restarting the backend reactivates it as
part of the same explicit local bootstrap recovery.

Identity registration is database-backed and assigns the existing `employee` role by
default. Only an authenticated administrator with `policies:manage` can register,
activate, revoke, or change roles. Revocation is persisted, invalidates all sessions,
and is rechecked on every protected request. The dashboard polls `/api/auth/me` every
15 seconds to show a revocation/session-expiry message; backend denial remains
authoritative if polling fails.

## Reproducible identity and revocation check

1. Start MongoDB, configure `MONGODB_URI`, set `BOOTSTRAP_ADMIN_WALLET` to the
   administrator's public address, and start backend/frontend.
2. Log in as the administrator, register two different wallet addresses, and confirm
   both identities have the `employee` role and no `admin` role.
3. Use two separate browsers/devices to sign in with the two wallets. Confirm each
   session has its own token and that a normal user receives `403` from identity,
   policy, and other administrative endpoints.
4. Try an unregistered wallet, a signature from a different wallet, an expired
   challenge, and a second submission of the same challenge; each must be rejected.
5. From the administrator browser revoke User A. User A's next protected request
   must fail even with the old bearer token, and the dashboard should return to
   login within the polling interval. User B must remain active.
6. Restart the backend and repeat login/listing checks. Identities, revoked status,
   audit records, and sessions are read from MongoDB rather than recreated in memory.
7. With blockchain configuration enabled, stop or misconfigure the RPC before a
   revocation. The API must return an error and no success transaction; application
   access remains blocked because database revocation is authoritative while chain
   synchronization is pending/failed. With blockchain configuration absent, the
   documented mode is database-only.

## Policy Management and Protected Resources

The `/policies` screen shows the live permission map for the supported `employee`, `manager`, and
`admin` roles. Users need the effective `policies:manage` permission to view or mutate policies.
Granting or revoking a permission explains that the change affects every identity with the role;
revocation requires an explicit confirmation. Policy responses include an optional blockchain
transaction result when blockchain administration is configured.

The Employee, Reports, and Payroll navigation links are shown according to the current effective
permissions, but every resource request is still authorized by the backend using the active
identity, session, enrolled device, role, permission, resource, and action. The resource screens
display the real API response and distinguish backend authorization failures from network failures.
Policy changes are evaluated on every request, so revocations take effect without waiting for a
stale permission snapshot.

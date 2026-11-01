# API

The backend exposes the following route groups:

- `GET /api` - basic backend readiness response
- `GET /api/health` - health snapshot used by the frontend
- `GET /api/health/ready` - MongoDB readiness status
- `/api/auth` - challenge, verification, logout, session introspection, and revoke-all sessions
- `/api/identities` - identity registration, lookup, profile, lifecycle, and role management
- `/api/devices` - device enrollment, listing, replacement, revocation, heartbeat, and filters
- `/api/resources` - protected employee, reports, and payroll resources
- `/api/policies` - protected role permission management
- `/api/audit` - protected audit events, filters, pagination, and summary metrics

Audit retrieval requires an authenticated identity with the `policies:manage` permission.

Device trust endpoints include:

- `POST /api/devices/pair` - register a device public key as `PENDING`
- `PATCH /api/devices/:deviceId/permissions` - set explicit per-device permissions; an empty list inherits the identity's role permissions
- `PATCH /api/devices/:deviceId/approve` - administrator approval using `policies:manage`
- `GET /api/devices?scope=all` - administrator inventory view
- `POST /api/devices/:deviceId/heartbeat` - heartbeat, with a signed proof required for cryptographic devices
- protected resource requests - require `X-Aegis-Device-Timestamp` and `X-Aegis-Device-Signature` for cryptographic devices

Device-only authentication is available after administrator approval:

- `POST /api/auth/device/challenge` - issue a one-time challenge for an approved device
- `POST /api/auth/device/verify` - verify the device signature and create a session bound to that device

This flow does not require MetaMask. The device's private key signs the challenge locally.
Device-login challenges are persisted in MongoDB when it is available and are
consumed atomically, so a backend restart cannot turn a previously issued
challenge into an untracked or reusable login.

Administrators with `policies:manage` can revoke devices across managed
identities. Revoking a device also revokes every active session bound to it;
the device cannot authenticate again until it is replaced and approved.
Revoking an identity applies the same containment to every active device
belonging to that account.
This includes existing device-authenticated sessions: the next protected
request is denied, and the revoked device cannot obtain a new session.

The proof signs the device ID, session ID, timestamp, HTTP method, and request
path (including the `/api` prefix). Proofs older than one minute, invalid signatures, pending devices, and
revoked devices are denied.
`GET /api/audit` accepts `identityId`, `eventType`, `outcome`, `limit` (1-100), and
`offset` (0 or greater). It returns the filtered `total` and the current page of
events. `GET /api/audit/summary` returns totals by outcome and event type.

Audit integrity endpoints, all protected by `policies:manage`, include:

- `POST /api/audit/anchor` to batch unanchored MongoDB audit records and anchor the Merkle root.
- `GET /api/audit/batches` to list anchor attempts and their status.
- `GET /api/audit/batches/:batchId/verify` to detect modified or deleted records.
- `GET /api/audit/:eventId/proof` to retrieve a Merkle inclusion proof.
- `GET /api/audit/:eventId/verify` to verify the current record against its batch and optional on-chain root.

Configured blockchain trust-state failures deny protected authorization requests rather than silently allowing access. Audit anchoring failures are stored as retryable `FAILED` batch attempts and do not mark audit events as anchored.

The audit dashboard at `/audit` presents these endpoints to authorized administrators.
The current audit store is process memory, so the dashboard does not prove durable
retention, tamper resistance, or complete history.

The current service implementations are primarily in memory. Persistent repositories and blockchain-backed trusted-state synchronization are still required for production completion.

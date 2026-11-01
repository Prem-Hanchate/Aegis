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
`GET /api/audit` accepts `identityId`, `eventType`, `outcome`, `limit` (1-100), and
`offset` (0 or greater). It returns the filtered `total` and the current page of
events. `GET /api/audit/summary` returns totals by outcome and event type.

The audit dashboard at `/audit` presents these endpoints to authorized administrators.
The current audit store is process memory, so the dashboard does not prove durable
retention, tamper resistance, or complete history.

The current service implementations are primarily in memory. Persistent repositories and blockchain-backed trusted-state synchronization are still required for production completion.

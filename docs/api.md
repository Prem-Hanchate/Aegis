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

The current service implementations are primarily in memory. Persistent repositories and blockchain-backed trusted-state synchronization are still required for production completion.

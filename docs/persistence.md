# MongoDB persistence

Aegis uses MongoDB as the authoritative runtime store for identities,
authentication challenges, sessions, devices, policies, and audit events.
The backend does not fall back to process-local state when MongoDB is
unavailable. Startup fails when the required database cannot be reached, and
readiness returns `503` while the connection is unavailable.

Challenges and sessions have TTL indexes for expiry cleanup. Challenge
verification uses an atomic update that claims an unused, unexpired challenge,
so concurrent verification attempts cannot both create sessions. Session,
identity, and device revocations are conditional database updates and therefore
survive process restarts.

Audit queries are ordered by `timestamp` descending and `eventId` descending.
The timestamp is the primary ordering signal; `eventId` is a deterministic
tie-breaker when concurrent writes share the same timestamp. This provides
stable database ordering but is not a global event-time sequence across
processes.

## Tests

Backend persistence tests must use an isolated MongoDB database. Start the
repository MongoDB service with `docker compose up -d mongo`, then run
`npm run test:persistence -w backend`. The test runner appends a random
database suffix to `MONGODB_TEST_URI` for every run.

Alternatively, set `MONGODB_TEST_URI` to a disposable MongoDB URI before
running the command. Do not point tests at a developer or production database.
The test-only `clear*` helpers delete repository data and are rejected outside
`NODE_ENV=test`.

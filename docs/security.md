# Security

The current implementation includes:

- HTTPS-ready backend configuration
- CORS and rate limiting middleware
- Helmet-based HTTP hardening
- Centralized error handling
- Request validation and centralized backend authorization
- Wallet challenge/signature verification with expiry and replay protection
- Opaque bearer sessions with expiry and revocation
- Identity, device, role, permission, resource, action, and context checks
- Structured audit events and Merkle-based integrity verification
- Blockchain synchronization and on-chain revocation checks when configured

The backend remains the security boundary. Frontend checks are only presentation aids, private keys remain in MetaMask, and raw personal audit records are not stored on-chain. Configured blockchain trust-state failures are required to fail closed; local development may omit blockchain configuration explicitly.

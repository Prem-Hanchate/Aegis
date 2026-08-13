# Aegis Project Instructions

These rules apply to all AI-assisted development work in this repository.

1. Do not invent features outside the MVP.
2. Do not implement MFA, Passkeys, SIEM, SSO, VC, or multi-chain unless explicitly requested.
3. Do not store private keys.
4. Do not ask users for seed phrases.
5. Do not put sensitive personal data on blockchain.
6. Do not use blockchain transactions for normal authorization requests.
7. Do not trust wallet address without signature verification.
8. Do not accept reused or expired nonces.
9. Do not trust frontend authorization checks.
10. Backend authorization is the security boundary.
11. Do not treat successful login as permanent trust.
12. Check identity, device, session, and permission status.
13. Do not hardcode permissions throughout the code.
14. Keep authorization centralized.
15. Do not silently ignore failed blockchain synchronization.
16. Do not claim blockchain provides complete security.
17. Add tests whenever implementing security-sensitive functionality.
18. Do not rewrite working modules unnecessarily.
19. Before changing architecture, explain why.
20. After each phase, run tests and report results.

Phase guidance:

- Keep authentication separate from authorization.
- Keep blockchain state minimal and trusted, not request-path critical.
- Prefer modular, understandable implementations over premature complexity.
- Build one phase at a time using this cycle: master prompt -> phase -> review -> next phase -> test -> repeat until final demo.
- Do not queue many phase prompts without checking output and test results after each phase.

## TODO List

1. Phase 0: Review the repository and confirm the current architecture, folder structure, and missing components.
2. Phase 1: Maintain the clean project foundation, health checks, routing, and basic frontend/backend connectivity.
3. Phase 2: Implement wallet-based challenge-response authentication with nonce creation, storage, expiry, and replay protection.
4. Phase 3: Add identity, session, and device models with enrollment, replacement, revocation, and status checks.
5. Phase 4: Implement centralized Zero Trust authorization with role, permission, resource, and action evaluation.
6. Phase 5: Add smart contracts for identity, policy, and revocation state with secure access control.
7. Phase 6: Add blockchain synchronization, backend caching, and tamper-resistant audit anchoring.
8. Phase 7: Build the admin management interface for identities, devices, roles, permissions, policies, and audit logs.
9. Phase 8: Add security hardening, input validation, rate limiting, and production-safe error handling.
10. Phase 9: Expand automated tests across authentication, authorization, devices, blockchain, and audit flows.
11. Phase 10: Wire the end-to-end MVP demo flow from admin setup through user access decisions and audit logging.

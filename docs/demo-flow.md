# Demo Flow

Current frontend demo:

1. Start the backend.
2. Start the frontend.
3. Open `/login` with MetaMask installed.
4. Connect a wallet with an active registered Aegis identity.
5. Approve the challenge signature in MetaMask.
6. Confirm the protected dashboard loads and fetches `GET /api/health`.
7. Open `/control-center` to view identity, device, policy, audit, and session controls.
8. Use a protected resource action to observe an allow or deny decision.

The current demo uses in-memory backend stores. A complete production demo additionally requires MongoDB persistence, deployed contracts, and blockchain synchronization.

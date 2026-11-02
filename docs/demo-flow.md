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

## Cryptographic device demonstration

The supported browser flow needs no Node.js on the device. Open
`http://<computer-lan-ip>:5173` on a phone or computer on the same network,
authenticate, and open **My devices**.

1. Choose **Pair This Browser** and enter a device name.
2. In the administrator UI, open **My devices** and approve the pending
   device.
3. Return to the paired browser and choose **Bind to Session**.
4. Open `employee`, `reports`, or `payroll`; the browser signs the request
   locally.
5. Revoke the device in the UI and repeat the request; Aegis denies it.

For command-line testing only, the agent workflow remains available:

   ```bash
   node tools/device-agent.mjs pair --token <token> --name "Demo workstation"
   ```

This proves device-key possession, administrator approval, and revocation at
the API boundary. It does not claim to control the host operating system.

The current demo uses in-memory backend stores. A complete production demo additionally requires MongoDB persistence, deployed contracts, and blockchain synchronization.

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

The backend starts on `http://localhost:4000` (configurable via `PORT` in `backend/.env`).

3. Start the frontend development server:

```bash
npm run dev:frontend
```

The frontend runs on `http://localhost:5173`.

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
5. **Signature Verification**: The signature is posted to `POST /api/auth/verify`. The backend recovers the signer using `ethers.verifyMessage`, verifies the active registered identity, invalidates the nonce to prevent replay attacks, and issues an in-memory 15-minute bearer token.
6. **Session & Protected Workspace**: The client establishes the authenticated session in React state and redirects to the protected Dashboard (`/`).
7. **Sign Out**: Clicking **"Sign out"** invokes `POST /api/auth/logout` to revoke the token on the backend and resets the in-memory state.
8. **Account Switching Protection**: Listening to `accountsChanged` in MetaMask ensures that if the user switches active accounts in their wallet, the current session is immediately invalidated to prevent mismatched identity actions.

---

## Zero Trust Evaluation & Endpoints

- **Public Gateways**:
  - `GET /api/health`: Operational backend diagnostics
  - `POST /api/auth/challenge`: Nonce challenge generation
  - `POST /api/auth/verify`: Cryptographic verification and session issuance
- **Authenticated Endpoints**:
  - `POST /api/auth/logout`: Revokes active bearer session
  - `GET /api/auth/me`: Session and identity introspection
  - `GET /api/resources/:resource`: Policy-evaluated resource access (`employee`, `reports`, `payroll`)
  - `GET /api/devices`: Enrolled device posture

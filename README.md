# Aegis

Decentralized Identity & Zero Trust Access Controller.

Project instructions for AI-assisted changes are in [copilot-instructions.md](copilot-instructions.md).

This repository is organized as a small monorepo with three parts:

- `frontend/` - React + TypeScript user and admin interface
- `backend/` - Node.js + Express + TypeScript API
- `contracts/` - Hardhat + Solidity smart contracts

Phase 1 establishes the application foundation only. Authentication, authorization, device policy, and blockchain state sync are intentionally kept minimal until later phases.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- MongoDB available locally or remotely for later phases
- MetaMask installed for later authentication phases

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

- `backend/.env`
- `frontend/.env`
- `contracts/.env` if needed for deployment later

Example values are provided in each package's `.env.example` file.

3. Start the backend:

```bash
npm run dev:backend
```

4. Start the frontend in another terminal:

```bash
npm run dev:frontend
```

5. Compile the contracts:

```bash
npm run build -w contracts
```

6. Run all available tests:

```bash
npm test
```

## Phase 1 Scope

Implemented in this phase:

- Clean folder structure
- React frontend shell with routing
- Frontend API service layer
- Frontend auth state structure
- Backend Express application shell
- Environment configuration
- MongoDB connection helper
- Security middleware
- Error handling middleware
- Request validation helper
- Health-check endpoint
- Frontend health status page
- Hardhat project scaffolding
- Solidity contract scaffold
- Contract test scaffold

Not implemented yet:

- Wallet challenge-response authentication
- Session issuance and revocation
- Role and permission management
- Zero Trust authorization engine
- Device enrollment and revocation flows
- Audit anchoring logic
- Production deployment scripts

## Folder Structure

```text
frontend/
backend/
contracts/
```

## Health Check

- Backend health endpoint: `GET /api/health`
- Frontend dashboard: `http://localhost:5173/`

## Notes

The backend is designed to start without a MongoDB URI so the phase 1 health check can run in isolation. Later phases will require a real MongoDB configuration.

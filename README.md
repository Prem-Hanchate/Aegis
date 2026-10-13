# Aegis

Decentralized Identity & Zero Trust Access Controller.

Project instructions for AI-assisted changes are in [copilot-instructions.md](copilot-instructions.md).

This repository is organized as a small monorepo with three parts:

- `frontend/` - React + TypeScript user and admin interface
- `backend/` - Node.js + Express + TypeScript API
- `contracts/` - Hardhat + Solidity smart contracts

The foundation, initial wallet authentication flow, protected dashboard, and first administration control center are implemented. MongoDB persistence and blockchain state synchronization remain later stages.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- MongoDB available locally or remotely for later phases
- MetaMask installed for wallet authentication

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

7. Start the local production-shaped stack:

```bash
docker compose -f docker-compose.prod.yml up --build
```

The frontend is available at `http://localhost`, and its Nginx proxy forwards `/api` requests to the backend. Set the RPC and deployed contract address variables before using blockchain features.

## Current Scope

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
- MetaMask challenge/sign/verify login page
- Protected authenticated dashboard
- Identity, device, policy, audit, resource, and session control center
- Hardhat project scaffolding
- Solidity contract scaffold
- Contract test scaffold

Still remaining:

- MongoDB repositories and persistent stores
- Functional blockchain synchronization and deployed contract integration
- Audit hash anchoring
- Full end-to-end integration environment

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

The backend currently uses in-memory runtime stores for most identity, session, device, policy, and audit data. MongoDB is required for durable data and production use.

# Architecture

Phase 1 establishes the base layout for Aegis:

- `frontend/` - React UI shell with routing and backend connectivity
- `backend/` - Express API with shared middleware, environment config, and health checks
- `contracts/` - Hardhat workspace for Solidity contracts and tests

The current repository intentionally stops short of implementing wallet authentication, Zero Trust authorization, device lifecycle management, or blockchain state synchronization.

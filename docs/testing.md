# Frontend test mode

The frontend includes an explicit development-only test mode for reviewing all
routes without connecting MetaMask.

## Enable

Create `frontend/.env.local`:

```env
VITE_AEGIS_TEST_MODE=true
```

Start the Vite development server:

```bash
npm run dev -w frontend
```

The application shows a compact `Test mode` switch beside the session controls
and authenticates a synthetic `Aegis Test Operator` in memory. Use the switch
to enable or disable the in-memory route preview during development. All
protected frontend routes and permission-aware navigation can be inspected.

## Security boundaries

- Test mode requires both Vite development mode and
  `VITE_AEGIS_TEST_MODE=true`.
- Production builds cannot activate it through this flag.
- No credentials, private keys, or bearer tokens are created for backend use.
- Backend authorization is not bypassed. API-backed controls will show their
  normal backend response when the test token is rejected.
- Test mode state is held in memory and disappears when the page is reloaded.

This is a route-preview tool, not an authentication bypass or backdoor.

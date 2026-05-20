# Copilot Instructions — nfs-mount

> **The authoritative agent guide is [`AGENTS.md`](../AGENTS.md).** Read it
> first. This file is a short pointer for GitHub Copilot Chat with the
> must-know rules.

## Project at a glance

- **Purpose**: WebUI + REST API to manage NFS client mounts, exports,
  MergerFS pools, WireGuard, firewall and server-monitor metrics on a
  single Linux host. Tuned for 300+ concurrent NFS streams.
- **Backend**: FastAPI + SQLAlchemy 2 (async, aiosqlite) under
  [`backend/app/`](../backend/app/).
- **Frontend**: React 18 + Vite + Tailwind under
  [`frontend/`](../frontend/).
- **DB**: SQLite at `/data/nfs-manager.db`.
- **Docker**: [`Dockerfile`](../Dockerfile),
  [`docker-compose.yml`](../docker-compose.yml).

## Hard rules

1. **Provider order in [`main.jsx`](../frontend/src/main.jsx)** is fixed:
   `BrowserRouter → QueryClientProvider → AuthProvider → ToastProvider
→ ConfirmProvider → App`. Don't reorder.
2. **One transport** —
   [`api/client.js`](../frontend/src/api/client.js). Never `fetch` directly
   from components: that skips auth, 401 handling and logging.
3. **Polling**: use `useQuery` + `refetchInterval` (preferred for new code)
   or `usePolling` (legacy pages). Both pause when the tab is hidden via
   `refetchIntervalInBackground: false` in
   [`queryClient.js`](../frontend/src/queryClient.js). Never raw
   `setInterval`.
4. **Polling intervals** (per §4.4 of AGENTS.md):
   - Dashboard: 30 s · Logs: 10 s · NFS Client/Exports: 30 s · Health
     Check: 30 s · Server Monitor: 60 s. Don't lower without measuring
     req/min first.
5. **Logging**:
   - 2xx/3xx → DEBUG
   - **401 / 403 / 404 / 405** → DEBUG (bot scans + post-logout polling
     are expected noise)
   - Other 4xx → WARNING
   - 5xx → ERROR
   - Invalid JWT → DEBUG
6. **Auth flow**: 401 anywhere ⇒ `api/client.js` clears credentials and
   dispatches `auth:unauthorized`. `AuthContext` listens, logs out, and
   calls `queryClient.cancelQueries() + clear()` to stop polling.
7. **Aggregated endpoints**: when a view would cause > 2 parallel polls,
   add a bundled summary endpoint following the
   `GET /api/system/dashboard-summary` pattern (`_safe + asyncio.gather`).
8. **DB**: async only (`AsyncSession`, `select(Model)`,
   `result.scalars().all()`). Never sync `requests`/`subprocess.run` on
   the request loop — use `asyncio.to_thread` or
   `create_subprocess_exec`.

## Host tuning gotchas (see §9 of AGENTS.md)

- When a host that runs an NFS client also exposes other services through
  a **single NIC with only 1 RX queue** (e.g. Intel I219), heavy NFS load
  starves short outbound probes from sibling containers → flap.
- Fix script: [`scripts/tune-nic-eno1.sh`](../scripts/tune-nic-eno1.sh) —
  RPS, ring-buffer max, `fq_codel`, sysctl tuning, systemd-unit for boot
  persistence. **Idempotent**, safe to re-run.

## Things to avoid

- Bypassing `api/client.js`.
- Logging expected 401/403/404/405 at WARNING — they're DEBUG.
- Adding new ORM tables without a migration plan (this repo still uses
  `Base.metadata.create_all` on startup).
- Committing secrets (`JWT_SECRET`, API keys, Discord/Telegram tokens
  belong in env / `/data/`).

## Commands

```pwsh
# Frontend dev (proxies /api → backend)
cd frontend ; npm install ; npm run dev

# Frontend prod build
cd frontend ; npm run build

# Full container build
docker compose up -d --build
```

WebUI: <http://localhost:8080>.

When conventions change, **update [`AGENTS.md`](../AGENTS.md) in the same
PR**.

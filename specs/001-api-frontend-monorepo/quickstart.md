# Quickstart & Validation Guide

Proves the target architecture's goals are met. Commands are the **intended** monorepo interface
(implemented during migration, not in this planning cycle).

## Prerequisites

- Node.js 20 LTS, pnpm, a PostgreSQL database (`DATABASE_URL`).
- Env: `apps/api/.env` (DB, JWT secrets, CORS origin); `apps/web/.env` (`VITE_API_URL`).

## Run each app independently (validates FR-002, SC-001, SC-002)

```bash
pnpm install                 # install all workspaces

# Backend ALONE (frontend not running):
pnpm --filter @finance/api dev
#   → API up on :3001; GET /api/v1/health returns 200; a domain endpoint responds.

# Frontend ALONE (separate terminal / machine):
pnpm --filter @finance/web dev
#   → SPA up on :5173, reaching the API only via VITE_API_URL.

# Both via Turborepo:
pnpm dev                     # turbo runs api + web in parallel
```

## Build independently (validates SC-006)

```bash
pnpm --filter @finance/api build    # backend build, no web rebuild
pnpm --filter @finance/web build    # static SPA bundle, no api rebuild
turbo run build --filter=...[origin/main]   # build only affected app in CI
```

## Validation scenarios

| # | Scenario | Expected | Maps to |
|---|----------|----------|---------|
| 1 | Start API with web stopped; `GET /api/v1/health` | 200; domain endpoint works | SC-001 |
| 2 | Build web; serve static bundle pointing at API URL | UI loads, talks to API over HTTP only | SC-002 |
| 3 | Open `apps/api/src/domains/debts/` | routes + service + repository + dto co-located | SC-003 |
| 4 | Grep web for imports of `apps/api/**` or Prisma | 0 matches | SC-004 |
| 5 | Change a contract type in `packages/contracts` | both apps reference the single definition | SC-005 |
| 6 | Inspect dependency graph | api imports no web code; packages import neither app | SC-007 |
| 7 | New dev locates all code for one domain | < 2 min using documented conventions | SC-008 |
| 8 | Run `pnpm test` | Vitest runs across apps + packages | Principle IV |

## Boundary checks (validates FR-006, FR-011)

- Lint/tooling rule forbids `apps/web` importing `apps/api/**` and any DB client.
- `packages/*` declare no dependency on `apps/*`.

See [contracts/api-conventions.md](./contracts/api-conventions.md) and [data-model.md](./data-model.md)
for the API surface and entities. Implementation details belong in `tasks.md`.

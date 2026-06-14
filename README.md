# FinanceApp

Personal finance tracker — a **pnpm + Turborepo monorepo** with two separately-deployable apps:

- **`apps/api`** — NestJS backend, sole owner of the database (Prisma / PostgreSQL), JWT auth in
  httpOnly cookies, domain-first modules under `src/domains/*`.
- **`apps/web`** — Vite + React SPA, consumes the API over HTTP only, owns the es/en translations.
- **`packages/*`** — shared `contracts` (zod schemas + types), `money` (decimal.js), `config`.

## Quickstart

```bash
pnpm install
pnpm --filter @finance/api exec prisma generate
# configure apps/api/.env and apps/web/.env (see each .env.example)
pnpm dev            # runs api (:3001) + web (:5173) via Turborepo
```

Common scripts: `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm check:boundaries`,
`pnpm db:migrate`, `pnpm db:seed`.

## Docs

- Architecture & how it works (en/es): [docs/](docs/) — [english/ARCHITECTURE.md](docs/english/ARCHITECTURE.md) ·
  [english/HOW_IT_WORKS.md](docs/english/HOW_IT_WORKS.md) · [spanish/](docs/spanish/).
- Formal spec & migration: [specs/001-api-frontend-monorepo/](specs/001-api-frontend-monorepo/)
  (`plan.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`).
- Per-app conventions: [apps/api/README.md](apps/api/README.md), [apps/web/README.md](apps/web/README.md).
- Project principles: [.specify/memory/constitution.md](.specify/memory/constitution.md).
- Product/domain context (historical stack): [docs/english/APP_CONTEXT_AND_HISTORY.md](docs/english/APP_CONTEXT_AND_HISTORY.md) · [español](docs/spanish/APP_CONTEXT_AND_HISTORY.md).

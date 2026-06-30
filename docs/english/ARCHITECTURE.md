# FinanceApp — Architecture

Status: **current** (monorepo, branch `001-api-frontend-monorepo`). Authoritative for structure.
Product/domain context lives in [APP_CONTEXT_AND_HISTORY.md](./APP_CONTEXT_AND_HISTORY.md) (its
stack/routing details predate this migration and are historical). The formal spec is in
[specs/001-api-frontend-monorepo/](../../specs/001-api-frontend-monorepo/).

---

## 1. Overview

FinanceApp is a personal-finance tracker built as a **pnpm + Turborepo monorepo** with two
**separately deployable** applications and shared packages:

- **`apps/api`** — NestJS backend, the **sole owner of the database**, exposes a versioned HTTP API.
- **`apps/web`** — Vite + React SPA, consumes the API over HTTP only, owns the UI and translations.
- **`packages/*`** — shared contracts (zod), money math (decimal.js), and TS config.

The two apps share one repository but no runtime coupling: they communicate exclusively through a
published HTTP contract. This maximizes maintainability (domain-first layout), scalability
(independent build/deploy/scale), and discoverability (everything for a domain in one place).

```
┌─────────────┐      HTTP /api/v1 (JSON, httpOnly cookies)      ┌──────────────┐
│  apps/web   │ ───────────────────────────────────────────────▶│   apps/api   │
│ Vite + React│ ◀───────────────────────────────────────────────│   NestJS     │
│  (SPA)      │           data + language-agnostic codes         │  (sole DB    │
└─────────────┘                                                  │   owner)     │
        │                                                        └──────┬───────┘
        │ imports (types/values)        imports (types/values)          │ Prisma
        ▼                                                               ▼
   ┌──────────────────────── packages/* ───────────────────┐    ┌────────────┐
   │  contracts (zod+types) · money (decimal.js) · config   │    │ PostgreSQL │
   └────────────────────────────────────────────────────────┘    └────────────┘
```

### Why these choices (rationale)

- **Why split frontend & backend (by service):** clear ownership and security — the backend owns
  data, business rules, and secrets; the browser only ever sees the published HTTP contract (the DB
  and credentials never reach the client). They also have different runtimes and scaling profiles
  (a stateful Node API near the DB vs. static files on a CDN), so each builds, deploys, and scales
  on its own — a frontend fix doesn't redeploy the API. The contract is the only coupling, so either
  side can be rewritten or another client (mobile/CLI) added; business logic is testable without a
  browser and the UI without a database.
- **Why a monorepo (not two repos):** the shared contract (`@finance/contracts`) and money math
  (`@finance/money`) live in one place (no version drift), a contract change plus both consumers
  land in one PR (atomic), and there's one toolchain + CI — while runtime stays fully decoupled. The
  one-way dependency rule keeps `apps/api` + `packages/*` self-contained, so extracting the backend
  to its own repo later is mechanical.
- **Why domain-first (not layer-first):** everything about a domain (e.g. _debts_) lives in one
  folder — you navigate by feature, not by a technical layer scattered across the tree. Adding or
  removing a whole domain is local; the app scales by _number of domains_ instead of growing
  unbounded global `controllers/`/`services/` folders.
- **Why the module/controller/service/repository format:** it's the standard NestJS layering, one
  repeatable skeleton per domain — **controller** = HTTP edge (parse/validate/return), **service** =
  business logic, **repository** = the only place that touches Prisma. That keeps per-user scoping
  auditable in one spot, makes each layer unit-testable, and makes adding a domain mechanical
  (copy the skeleton). Shapes are described once as zod (compile-time safety on both sides); money
  crosses as strings for precision.

## 2. Repository layout

```
finance-app/
├── apps/
│   ├── api/                       # NestJS backend
│   │   ├── src/
│   │   │   ├── main.ts            # bootstrap: global prefix /api/v1, cookies, CORS(credentials), error filter
│   │   │   ├── app.module.ts      # wires infra + all domain modules
│   │   │   ├── domains/<domain>/  # auth, accounts, transactions, installments, debts, savings, investments, import, health
│   │   │   │   ├── <d>.module.ts
│   │   │   │   ├── <d>.controller.ts
│   │   │   │   ├── <d>.service.ts
│   │   │   │   ├── <d>.repository.ts
│   │   │   │   └── <d>.service.spec.ts
│   │   │   └── infra/             # prisma (single client), auth (guard + @CurrentUser), http (error filter + ZodValidationPipe), config
│   │   ├── prisma/                # schema.prisma + seed.ts  (DB lives with the API)
│   │   ├── test/                  # e2e (health)
│   │   └── Dockerfile
│   └── web/                       # Vite + React SPA
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/               # providers (Query, i18n, Auth), router
│       │   ├── domains/<domain>/  # api/ hooks/ components/ routes/ (+ tests)
│       │   ├── shared/lib/        # apiClient
│       │   └── i18n/              # es.json / en.json (frontend owns translations)
│       ├── Dockerfile + nginx.conf
│       └── vite.config.ts
├── packages/
│   ├── contracts/                # zod schemas + inferred types, one module per domain
│   ├── money/                    # decimal.js money helpers, installment schedule, interest
│   └── config/                   # shared tsconfig.base.json
├── scripts/check-boundaries.mjs  # enforces import boundaries
├── .github/workflows/ci.yml
├── turbo.json · pnpm-workspace.yaml · package.json (workspace root)
└── specs/001-api-frontend-monorepo/   # spec, plan, contracts, tasks
```

### What each folder contains

**Backend `apps/api/src/`**

- `main.ts` — process bootstrap: global prefix `/api/v1`, cookie parser, CORS (credentials), global
  error filter, then `listen`.
- `app.module.ts` — composition root: imports infra modules + every domain module.
- `domains/<domain>/` — one business domain. `*.module.ts` (wiring), `*.controller.ts` (HTTP routes,
  guard, zod validation), `*.service.ts` (business logic; money via `@finance/money`),
  `*.repository.ts` (the **only** Prisma access for that domain, always scoped by `userId`),
  `*.service.spec.ts` (tests), optional `dto/`.
- `infra/` — cross-cutting, **not** a business domain: `prisma/` (the single `PrismaService`),
  `auth/` (`JwtAuthGuard` + `@CurrentUser`), `http/` (`AllExceptionsFilter` + `ZodValidationPipe`),
  `config/` (env).
- `common/` — small Nest utilities shared by several domains (pipes/interceptors).
- `prisma/` — `schema.prisma`, migrations, `seed.ts` (the database definition — see below).
- `test/` — e2e tests that bootstrap the Nest app.

**Frontend `apps/web/src/`**

- `main.tsx` — mounts React inside `Providers` + `RouterProvider`.
- `app/` — app shell: `providers.tsx` (Query, i18n, Auth), `router.tsx` (route table), top-level pages.
- `domains/<domain>/` — one business domain on the client: `api/` (typed calls via the shared
  `apiClient` + contracts), `hooks/` (TanStack Query hooks / context), `components/` (presentational),
  `routes/` (screens), plus `*.test.tsx`.
- `shared/` — non-domain reusable code: `lib/` (apiClient, helpers) and UI primitives.
- `i18n/` — the es/en catalogs (the frontend owns translations) + setup.
- `styles/` — global styles.

**`packages/`**

- `contracts/` — zod schemas + inferred types; one module per domain + `common`. The API contract.
- `money/` — decimal.js helpers, installment schedule, interest. Runtime financial math.
- `config/` — shared `tsconfig.base.json`.

**Repo root** — `scripts/` (e.g. `check-boundaries.mjs`), `.github/workflows/` (CI),
`turbo.json` / `pnpm-workspace.yaml` / `package.json` (workspace orchestration), `specs/`, `docs/`,
`.specify/`.

### Where the database models live

- **Persistence model (the database):** `apps/api/prisma/schema.prisma` — the Prisma models, enums,
  and indexes. This is the **single source of truth for the DB**, owned exclusively by the backend;
  migrations and `seed.ts` sit alongside it. The generated Prisma client and its row types are used
  **only inside `apps/api`** (in repositories). The frontend has no access to them.
- **API / contract model (what the frontend sees):** the **zod schemas in `packages/contracts`** —
  the request/response shapes both apps share. They are deliberately **not** the Prisma models;
  services map a Prisma row → a contract DTO (e.g. `Decimal` → money string, `Date` → ISO string),
  so the DB can evolve without breaking the API as long as the mapping is updated.
- **Single import surface for model interfaces:** `packages/contracts/src/models.ts` re-exports
  every entity type (+ its create/update inputs and enums) in one flat place, so any code can do
  `import type { BankAccount, Transaction, Debt } from "@finance/contracts/models"`. This is the
  ergonomic, consistent way to reference model shapes (per-domain zod schemas/namespaces remain
  available from the package root). When you add a domain, add its types there too.
- **Rule of thumb:** change the DB → edit `apps/api/prisma/schema.prisma` + add a migration; change
  what the client receives → edit `packages/contracts` + the service mapping.

## 3. Backend (`apps/api`)

- **Framework:** NestJS 10 (TypeScript, CommonJS). Domain modules map 1:1 to business domains.
- **Per-domain skeleton:** `controller` (HTTP) → `service` (business logic) → `repository` (the
  only place that touches Prisma for that domain). DTO shapes come from `@finance/contracts`.
- **Database ownership:** a single `PrismaService` (`infra/prisma`, `@Global`) is the one DB client.
  The Prisma schema, migrations, and seed live in `apps/api/prisma`. No other app accesses the DB.
- **Validation:** `ZodValidationPipe` validates bodies/queries against zod schemas from
  `@finance/contracts`. (Nest's class-validator is intentionally not used.)
- **Errors:** a global `AllExceptionsFilter` maps everything to `{ error: { code, field? } }` with a
  stable SCREAMING_SNAKE `code` — **never localized prose**. HTTP status is preserved.
- **API surface:** REST under `/api/v1`, namespaced by domain (`/api/v1/accounts`, `/transactions`,
  `/installments`, `/debts`, `/savings`, `/investments`, `/import`, `/auth`). See
  [contracts/api-conventions.md](../../specs/001-api-frontend-monorepo/contracts/api-conventions.md).

## 4. Frontend (`apps/web`)

- **Framework:** Vite + React 18 SPA. Builds to a static bundle deployable to any CDN/static host.
- **API access:** only through `shared/lib/apiClient.ts`, which targets `VITE_API_URL`, sends
  `credentials: "include"` (httpOnly auth cookies), and turns non-2xx responses into
  `ApiRequestError(code, status, field)`.
- **Per-domain layout:** `domains/<domain>/{api,hooks,components,routes}`. Data fetching via
  TanStack Query; routing via react-router; auth via `AuthProvider`/`useAuth` + `RequireAuth`.
- **i18n:** the frontend **owns** the es/en catalogs (`src/i18n`). API error `code`s are mapped to
  `errors.<CODE>` messages client-side. Keys must stay in parity across es/en.

## 5. Shared packages (`packages/*`)

- **`@finance/contracts`** — zod schemas + inferred TS types; the single source of truth for the
  API contract. One module per domain (`accounts`, `transactions`, …) plus `common` (`moneyString`,
  `apiError`). Built to `dist` (CJS) for Node/Nest; an `import` export condition points to `src` so
  Vite bundles the TypeScript directly.
- **`@finance/money`** — all monetary math on `decimal.js`: parse/format/sum, `equalPrincipalSchedule`
  (equal-principal amortization, last installment absorbs the rounding remainder), and interest
  helpers (`simpleFutureValue`, `compoundFutureValue`, `simpleInterestAccrued`,
  `nominalAnnualToMonthlyRate`). Returns fixed-scale (4dp) decimal strings.
- **`@finance/config`** — shared `tsconfig.base.json`.

**Dependency direction (one-way):** `apps → packages`; `packages` depend on nothing in the repo;
`api ↛ web` and `web ↛ api`. This keeps `apps/api` + `packages/*` a self-contained subset, so the
backend could be extracted to its own repository mechanically.

## 6. Authentication

- Backend issues **JWT access + refresh tokens delivered as httpOnly cookies** (`domains/auth`):
  `POST /auth/register|login|refresh|logout`, `GET /auth/me`. Refresh rotates the pair.
- `JwtAuthGuard` validates the access cookie and attaches the user; `@CurrentUser` injects it.
  Every domain endpoint is scoped to the authenticated `userId` (per-user data isolation).
- The frontend `AuthProvider` hydrates from `/auth/me`, exposes `login/register/logout`, and
  `RequireAuth` gates protected routes.
- CORS allows the web origin with credentials. (CSRF protection for cookie auth is a planned hardening.)

## 7. Money & precision

Money never uses JS floats. It crosses the boundary as **decimal strings** (zod `moneyString`),
is computed with `@finance/money` (`decimal.js`), and is persisted as `Prisma.Decimal` at the
schema precision (`Decimal(18,4)` for amounts). Rounding is explicit (banker's rounding, 4dp).

## 8. Tooling, quality gates & boundaries

- **Turborepo** pipelines: `build`, `dev`, `test`, `lint`, `typecheck` (`turbo.json`); root scripts
  delegate to turbo, `--filter` runs a single app.
- **Tests:** Vitest across apps and packages (NestJS e2e via SWC plugin for decorator metadata;
  React via Testing Library + jsdom).
- **Boundaries:** `pnpm check:boundaries` (`scripts/check-boundaries.mjs`) fails the build if
  `apps/web` imports the backend or a DB client, if `apps/api` imports the frontend, or if any
  `packages/*` imports an app.
- **CI** (`.github/workflows/ci.yml`): install → `check:boundaries` → `turbo typecheck test build`
  (affected-filtered on PRs so each app builds/tests independently).
- **Definition of done:** `check:boundaries`, typecheck, tests, and build all pass.

## 9. Deployment

- **`apps/api`** → Node container (`apps/api/Dockerfile`, built from repo root); serves `/api/v1`.
- **`apps/web`** → static bundle behind nginx (`apps/web/Dockerfile` + `nginx.conf`, SPA fallback);
  configured at build time with `VITE_API_URL`.
- Each app has its own build/deploy lifecycle (separately deployable).

## 10. Environment

- `apps/api/.env`: `DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  optional `ALPHA_VANTAGE_API_KEY`.
- `apps/web/.env`: `VITE_API_URL`.
- Secrets are never committed; see each app's `.env.example`.

## 11. Known deferrals

- **Investments live ETF quote** (Alpha Vantage + `EtfPriceCache` 24h TTL) — not implemented; the
  investments domain is CRUD only.
- **Import file upload** — `POST /api/v1/import/transactions` accepts pre-parsed JSON rows;
  multipart/xlsx upload + server-side Excel parsing is deferred.
- **CSRF hardening** for cookie-based auth.

## 12. Adding a new domain (recap)

1. Add zod schemas + types in `packages/contracts/src/<domain>/` and export from `src/index.ts`.
2. Backend: create `apps/api/src/domains/<domain>/{module,controller,service,repository,spec}` and
   register the module in `app.module.ts`. Scope every query by `userId`; validate with
   `ZodValidationPipe`.
3. Frontend: create `apps/web/src/domains/<domain>/{api,hooks,routes}`, add the route to
   `app/router.tsx`, and add es/en i18n keys.
4. Run `pnpm check:boundaries && pnpm typecheck && pnpm test && pnpm build`.

See the per-app skeletons in [apps/api/README.md](../../apps/api/README.md) and
[apps/web/README.md](../../apps/web/README.md).

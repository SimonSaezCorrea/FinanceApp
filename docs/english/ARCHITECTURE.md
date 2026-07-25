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

## 12a. Backend DDD + CQRS pattern (in progress — `accounts` is the reference domain)

**Amendment (2026-07-25, specs/009-ddd-cqrs-architecture):** `apps/api` is migrating, domain by
domain, from the flat `module → controller → service → repository` skeleton in §1 to full tactical
DDD + CQRS. `accounts` (specifically its `billing`/credit-statement area) is the completed
reference implementation; the other 10 domains are migrated later, one at a time (FR-017) — until
then they still follow the flat skeleton described earlier in this document. Both shapes are valid
today; check which one a domain actually uses before assuming.

Each migrated domain gains **four internal layers** under `src/domains/<domain>/`:

| Layer | Contains | Never contains |
|---|---|---|
| `domain/` | Aggregates (invariants + lifecycle), State objects, Strategy objects, domain events, repository **ports** (interfaces), custom domain errors | Prisma imports, HTTP concerns |
| `application/` | Command/query objects + their handlers (`@nestjs/cqrs`'s `ICommandHandler`/`IQueryHandler`, built on a shared `BaseCommandHandler`/`BaseQueryHandler` Template Method in `src/infra/cqrs/`), event listeners | Prisma imports, business-rule duplication |
| `infrastructure/` | Prisma repository **adapters** implementing the domain's ports — the ONLY files in the domain allowed to import `@prisma/client` | Business rules |
| `presentation/` | The controller (a thin **Facade**: request → command/query via `CommandBus`/`QueryBus` → response) + Zod DTOs for body/query/**path params** (`ZodParamsPipe`, alongside the existing `ZodValidationPipe`) | Business rules, direct repository/Prisma calls |

Reference tree (`accounts`, after specs/009):

```
apps/api/src/domains/accounts/
├── accounts.module.ts                  # wires CqrsModule + all 4 layers
├── domain/
│   ├── bank-account.aggregate.ts       # invariants: cardable types, credit-pool rules
│   ├── credit-statement.aggregate.ts   # State pattern: OPEN → PENDING → PAID
│   ├── states/{credit-statement-state,open-state,pending-state,paid-state}.ts
│   ├── billing-eligibility.strategy.ts # Strategy: CREDIT_LINE vs. add-on-card eligibility
│   ├── events/{statement-closed,statement-paid,account-deactivated}.event.ts
│   ├── ports/{bank-account,credit-statement}.repository.port.ts
│   ├── errors.ts
│   └── billing-cycle.ts                # pure date-math helper (unchanged from pre-migration)
├── application/
│   ├── commands/*.command.ts + *.handler.ts   # pay/generate/correct/create/update/... + cards
│   ├── queries/*.query.ts + *.handler.ts       # list-accounts, get-account, list-credit-statements
│   └── events/log-statement-paid.listener.ts   # reference Observer subscriber
├── infrastructure/
│   ├── prisma-bank-account.repository.ts
│   └── prisma-credit-statement.repository.ts
└── presentation/
    ├── accounts.controller.ts
    └── dto/*.params.ts                  # Zod path-param schemas
```

Patterns applied, and why (full rationale in `specs/009-ddd-cqrs-architecture/spec.md` FR-005–FR-014):

- **State** (`CreditStatement`): each lifecycle stage is its own object (`OpenState`/`PendingState`/
  `PaidState`) answering `canClose()`/`canPay()`/`canCorrectAmount()` — the aggregate always
  delegates to `this.state`, never re-implements the check.
- **Strategy** (`BillingEligibilityStrategy`): "is this account/card shape eligible to close its
  period" varies by category (`CreditLineEligibility`/`AddOnCardEligibility`) and is expected to
  grow more categories — a new one is a new class, not an edited `if/else`.
- **Template Method** (`BaseCommandHandler`/`BaseQueryHandler`, `src/infra/cqrs/`): fixes the
  load → handle → persist → publish skeleton; concrete handlers only supply the three
  domain-specific steps. A command is always typed `{ scope: "user"; userId }` or
  `{ scope: "system" }` (the billing cron's `GenerateAllDueStatementsCommand` is the one named,
  typed exception to per-user scoping — every row it touches is still scoped internally).
- **Adapter** (`infrastructure/prisma-*.repository.ts`): implements a `domain/ports/*.port.ts`
  interface; the domain/application layers depend only on the port.
- **Facade** (`presentation/accounts.controller.ts`): translates request → command/query →
  response, nothing else.
- **Observer** (domain events + `@nestjs/cqrs`'s `EventBus`): a state transition worth knowing about
  elsewhere publishes an event (`StatementClosedEvent`/`StatementPaidEvent`/
  `AccountDeactivatedEvent`); listeners (`application/events/*.listener.ts`) subscribe without the
  publisher knowing they exist. **Dispatched synchronously by default** — a failing listener
  surfaces as part of the same request; async is opt-in per listener, only when a reaction can
  genuinely wait (none needed it yet).
- **Cross-aggregate persistence** (FR-020): a business action that inherently spans more than one
  aggregate in one atomic step (paying a statement touches `CreditStatement` + a new `Transaction` +
  `BankAccount`) uses one `prisma.$transaction(...)` inside that handler's own `persist()` override
  (`saveWithTx(tx, aggregate)` on the ports) — a documented pragmatic exception, not
  one-aggregate-per-transaction purity forced past the point of usefulness.
- **Explicitly out of scope** (FR-009/FR-014): Singleton (Nest's DI already provides it), Abstract
  Factory/Prototype (no such need exists here), Proxy (`JwtAuthGuard` already fills that role),
  Composite (no recursive/tree-shaped data in this app).

**Tests** move out of `src/` into `apps/api/test/{unit,integration,e2e}/`, mirroring
`src/domains/<domain>/<layer>/...`:

- `test/unit/**` — aggregates, states, strategies, command/query handlers with **fake ports** (no
  Prisma, no HTTP, no DB connection at all — provable by running `pnpm --filter @finance/api
  test:unit` with Postgres stopped).
- `test/integration/**` — Prisma adapters + the cross-aggregate transaction's rollback guarantee,
  against a real test database.
- `test/e2e/**` — full HTTP flows through the Facade controller, behaviorally identical to
  pre-migration (no public API/contract changes — FR-015).

`pnpm --filter @finance/api test:unit` / `test:integration` / `test:e2e` run each tier
independently; `pnpm --filter @finance/api test` runs all three in sequence.

No public HTTP contract or `@finance/contracts` shape changed by this migration — it is a pure
internal reorganization (FR-015). See `.specify/memory/constitution.md` for the corresponding
constitutional principle and `CLAUDE.md`'s `accounts` section for the narrative amendment.

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

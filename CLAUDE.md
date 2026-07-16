# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Canonical reference

`docs/{english,spanish}/APP_CONTEXT_AND_HISTORY.md` documents the product vision, data model, and business rules
(written for the original Next.js app — predates the monorepo migration; treat its stack/routing
details as historical, the domain/business rules still apply). `docs/english/ARCHITECTURE.md`
(+ `docs/spanish/`) and `specs/001-api-frontend-monorepo/` are authoritative for the current
monorepo structure. Code is the source of truth.

## Commands

Package manager is **pnpm**; the monorepo is orchestrated by **Turborepo** (root scripts delegate to `turbo`).

- `pnpm install` — install all workspaces (`apps/*`, `packages/*`)
- `pnpm dev` — run all apps (`turbo run dev`); or one: `pnpm --filter @finance/api dev` / `@finance/web`
- `pnpm build` — build everything (`turbo run build`); per app: `pnpm --filter @finance/web build`
- `pnpm test` — Vitest across all workspaces; one: `pnpm --filter @finance/api test`
- `pnpm typecheck` — `tsc --noEmit` per package
- `pnpm check:boundaries` — enforce import boundaries (`scripts/check-boundaries.mjs`)
- `pnpm db:migrate` / `pnpm db:seed` — Prisma migrate/seed in `apps/api` (the sole DB owner)
- `pnpm db:push` — sync schema to the DB without migrations (this repo has **no `prisma/migrations` folder**; `db push` is the workflow)
- `pnpm db:reset` — **Docker-based full reset** (`scripts/db-reset.mjs`): tears down the Postgres container + volume (`docker-compose.yml`), recreates it, `db push`, then seeds. Wipes all data (dev only). Requires Docker.

Setup: `apps/api/.env` (`DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, optional `ALPHA_VANTAGE_API_KEY`); `apps/web/.env` (`VITE_API_URL`). See each app's `.env.example`. After install, generate the Prisma client: `pnpm --filter @finance/api exec prisma generate`.

## Architecture (big picture)

**pnpm + Turborepo monorepo** with two separately-deployable apps + shared packages. TypeScript, Node 20. Migrated from the legacy single Next.js app via specs/001.

- **`apps/api`** — **NestJS 10**, the **sole owner of the database** (Prisma 7 / PostgreSQL, connected via the `@prisma/adapter-pg` driver adapter — Prisma 7 no longer accepts a `datasource.url` in `schema.prisma`; the connection string lives in `apps/api/prisma.config.ts` (CLI) and is passed to `PrismaService`'s constructor via `ConfigService` (app runtime); `prisma/seed.ts` builds its own adapter the same way). Domain-first: `src/domains/<domain>/` each with `*.module/.controller/.service/.repository.ts` (+ `*.spec.ts`). The 11 domains: auth, accounts, transactions, installments, debts, recurring, savings, investments, import, wallet, reference. Cross-cutting in `src/infra/` (`prisma` single client, `auth` `JwtAuthGuard` + `@CurrentUser`, `http` error filter + `ZodValidationPipe`, `config`). Global prefix `/api/v1`. **DB table names are kebab-case via `@@map`** (e.g. `bank-account`, `card-account`, `wallet-item-dashboard`); Prisma model names stay PascalCase. Auth is **pure JWT email+password** — the NextAuth `Account`/`Session`/`VerificationToken` tables were removed (no OAuth adapter in the API).
  - **accounts** (specs/003, 007): `BankAccount` is **where money or a credit line lives**. `type` (`AccountType`: **CHECKING/SIGHT/SAVINGS/INVESTMENT/CREDIT_LINE/CASH**), `status` (ACTIVE/INACTIVE), optional `accountNumber` (**bank account number — free text, stored/shown in full; NOT a card PAN**), `initialBalance` (seed) + reconciled `currentBalance` = initialBalance + Σincome − Σexpense (`POST /accounts/:id/reconcile`). **A standalone credit card = a `CREDIT_LINE` account**: the credit pool lives on the account as `creditLimit` + `creditUsedInitial` (seed); the contract exposes a **derived `creditUsed` = creditUsedInitial + Σexpense − Σincome** (income = card payments; computed on-read via `sumsByAccount`), `"0"` for non-credit accounts. List filter `?status=active|inactive`; `POST /accounts/:id/status`. List/get also return a 30d `balanceSeries` + `balanceChangePct` (for sparklines). Deleting unlinks transactions (`onDelete: SetNull`).
  - **cards** (specs/004, 007): `CardAccount` (table `card-account`) = the physical **payment instrument** (plastic), **always belongs to a `BankAccount`** (`onDelete: Cascade`) — `kind` (`CardKind`: **CREDIT/DEBIT/PREPAID**), `last4` (**only the last 4 digits ever transmitted/stored — full PAN never leaves the browser; no CVV**), `expiryMonth`/`expiryYear`, `isActive`. **Cards carry no limits** — the credit pool lives on the CREDIT_LINE account and is shared by all its cards (multiple cards on one credit-line account = "secondary/additional cards"). Nested endpoints `POST/PATCH/DELETE /accounts/:id/cards[/:cardId]`; `POST /accounts` accepts inline `cards[]`. Display masked as `•••• last4`.
  - **transactions** (specs/005, 007): income/expense linked to a `BankAccount` and (optionally) a `Card`. Rules in `transactions.service` (contract requires `bankAccountId` on create + refine `INCOME ⇒ no card`): INCOME → no card; EXPENSE on CASH → no card; EXPENSE on **CREDIT_LINE → card required** (must belong) and enforced against the account's `creditLimit` (derived used + amount ≤ limit, tx-excluded on edit via `sumsForAccount`); EXPENSE on other non-cash accounts → card optional. Full CRUD from both the Movements view and the Account view (shared `TransactionTable` with edit/delete). Filter query supports `bankAccountId` + `cardId` (bank→card). Error codes: `CARD_REQUIRED`, `CARD_NOT_ALLOWED`, `CARD_ACCOUNT_MISMATCH`, `CARD_LIMIT_EXCEEDED`.
  - **recurring**: `RecurringExpense` (subscriptions/rent/periodic payments) — `frequency` (`RecurrenceFrequency`: WEEKLY/MONTHLY/YEARLY), `interval`, `anchorDate`, optional `bankAccountId`/`category`, `active`. The contract exposes a computed `nextDueAt` (anchor stepped forward by frequency × interval). CRUD at `/recurring`.
  - **reference** (domain `reference`, global read-only, authed but not user-scoped): `Country` (table `country`, ISO 3166-1 `alpha2`/`alpha3`/`numeric` unique + name), `FinancialInstitution` (table `financial-institution`, **banks + non-bank card issuers** via `kind` `InstitutionKind` BANK/NON_BANK_ISSUER; `code` = SBIF/CMF or código institucional `@@unique([countryId,code])`, `name`, `rut?` (Chilean issuers), `category` `BankCategory?` ESTABLISHED/FOREIGN_BRANCH/STATE (banks only), `brands String[]`, `notes`, FK→Country), `Currency` (table `currency`, **ISO 4217** `code` unique + `numeric` + name), and `CountryCurrency` join (`isPrimary`). Endpoints `GET /countries`, `GET /institutions?country=CL&kind=BANK`, `GET /currencies` (ordered by name). Seeded idempotently in `prisma/seed.ts` (`seedReferenceData`): 6 countries, 18 CL banks + 15 non-bank issuers, 168 currencies, country↔currency links. **`BankAccount.institutionId`** FK → `FinancialInstitution` (the "institution" selector; scalar `institution` text mirrors its name for display; relation field is `financialInstitution`); web forms use `useInstitutions`/`useCurrencies` selects (`domains/reference`).
  - **wallet**: `WalletItemDashboard` (table `wallet-item-dashboard`) `(accountId? | cardId?, order)` — a user-curated set of pinned cards **or** accounts for the dashboard "wallet" (exactly one of card/account; XOR enforced in the service; `onDelete: Cascade`). Endpoints `GET/POST /wallet`, `PATCH /wallet/reorder` (`{ids[]}`), `DELETE /wallet/:id`.
- **`apps/web`** — **Vite + React 18 SPA**, consumes the API over HTTP only (`shared/lib/apiClient.ts`, `VITE_API_URL`). Domain-first: `src/domains/<domain>/{api,hooks,components,routes}`. Routing react-router, data via TanStack Query, **owns the es/en i18n catalogs** (`src/i18n`). **Styling: Tailwind CSS** (design tokens as CSS variables in `src/styles/index.css`, dark-mode ready) with shadcn-style primitives in `src/shared/ui` (`button`, `input`, `label`, `field`, `select`, `card`, `badge`, `table`, `page-header`, `states`, `theme-toggle`, `dialog` [Radix], `tabs`, `segmented`, `sparkline`) + `cn` helper (`shared/lib/cn.ts`); authed routes wrapped by `app/AppLayout.tsx`. The **Panel** (`app/DashboardPage.tsx` + `domains/dashboard`) is a frontend-only aggregation (net worth, month flow, category donut, upcoming payments, wallet). Libraries: **Recharts** (charts), **sonner** (toasts; `<Toaster/>` in `app/providers`), **@dnd-kit** (wallet drag-reorder). No DB access, never imports backend internals.
- **`packages/`** — `contracts` (zod schemas + inferred types = the API contract; one module per domain; built to dist CJS + `import` condition → src for Vite), `money` (`decimal.js`: money helpers, `equalPrincipalSchedule`, interest), `config` (shared `tsconfig.base.json`). One-way deps: `apps → packages`; `api ↛ web`; `packages ↛ apps` (enforced by `check:boundaries`).
- **Auth:** backend issues **JWT access+refresh tokens in httpOnly cookies** (`domains/auth`); `JwtAuthGuard` validates the access cookie and every endpoint is scoped to the authenticated `userId`. The frontend `AuthProvider`/`useAuth` + `RequireAuth` gate routes.
- **Errors:** the API returns **language-agnostic codes** `{ error: { code, field? } }` (never localized prose); the frontend maps `code` → `errors.<CODE>` in es/en.

## Conventions

- **Money:** never floats. Cross the boundary as **decimal strings** (zod `moneyString` in contracts); compute with `@finance/money` (`decimal.js`) / `Prisma.Decimal` at schema precision.
- **Validation:** request bodies/queries validated with **zod** schemas from `@finance/contracts` via `ZodValidationPipe` (NOT Nest's class-validator).
- **Per-user isolation:** every repository query is scoped by `userId`; controllers use `@CurrentUser`.
- **i18n:** every UI string in BOTH `apps/web/src/i18n/es.json` and `en.json` (identical keys); the API never returns localized text.
- **Styling / design system:** Tailwind utility classes + `src/shared/ui` primitives (button, input, label, field, card, badge, table, page-header, states, theme-toggle, dialog, tabs, segmented, sparkline). **Tokens are the only source** of color/size (CSS variables in `src/styles/index.css`); never hardcode `#hex`/`rgb()` — use token classes (`bg-background`, `text-muted-foreground`, `text-brand`, `bg-accent`, …). Palette includes the **clay `--accent`** channel (`#F4A261` dark / `#E76F51` light). Theming via `data-theme` on `<html>` (**dark default**, light, system) through `src/theme/ThemeProvider`; icons from **Lucide**, font **Geist** (`@fontsource-variable/geist`, Inter fallback). Full guide: `docs/{english,spanish}/DESIGN_SYSTEM.md`.
- **Boundaries:** keep the one-way dep rule; run `pnpm check:boundaries`. New domain → mirror an existing one (see `apps/api/README.md` / `apps/web/README.md` skeletons).
- **Commits:** only when the user explicitly asks.
- **Markdown:** don't add `.md` files unless requested.

**Deferred (not yet implemented):** investments live ETF quote (Alpha Vantage + `EtfPriceCache`); `import` multipart/xlsx file upload (the endpoint accepts pre-parsed JSON rows for now).

## Spec-Driven Development (SDD / Spec Kit)

This repo uses **GitHub Spec Kit** for feature work. Structure lives in `.specify/`
(templates, scripts, `memory/constitution.md`) and the workflow runs through the
`/speckit-*` skills: `constitution → specify → clarify → plan → checklist → tasks
→ analyze → implement`.

- **To build a feature the SDD way, use the `/sdd` skill** — it orchestrates the
  whole lifecycle end to end (crafts the specify prompt with the user, runs each
  command in order, holds review gates, asks when unsure). Don't run `implement`
  without an approved spec/plan/tasks chain.
- **Project principles** live in `.specify/memory/constitution.md` (v1.2.0). It supersedes
  ad-hoc practices; honor it in every plan and implementation.
- **Architecture migration (specs/001):** the monorepo above was implemented on branch
  `001-api-frontend-monorepo` (the legacy single Next.js app was removed). `main` still holds the
  legacy app until this branch is merged. Constitution is `v1.2.0`; bump it to reflect the merge
  when it lands. See specs/001-api-frontend-monorepo/{plan,tasks}.md.
- **Keep memory in sync (mandatory):** on ANY relevant change — new dependency,
  convention, data-model/schema change, env var, command, routing/auth change, or
  new principle — update BOTH `.specify/memory/constitution.md` (principle-level,
  bump version) AND this `CLAUDE.md` (architecture/commands/conventions) in the
  same session. These are the canonical, living memory; stale docs are a defect.

<!-- SPECKIT START -->

Active plan: specs/007-accounts-movements-redesign/plan.md
(Rediseño Cuentas y Movimientos + tarjetas secundarias. Card gana parentCardId (auto-relación, 1 nivel, cascade) → pool de cupo compartido crédito con sub-tope; CardLimit.used pasa de manual a initialUsed semilla + derivado de gastos (on-read, agrega secundarias en la principal). BankAccount gana accountNumber. Movimientos: banco obligatorio, gasto no-efectivo exige tarjeta, ingreso sin tarjeta, enforcement de cupo, CRUD en ambas vistas, filtro banco→tarjeta (fix cardId en toQuery), tag inactiva. Nuevos error codes CARD_*. Backend + frontend + migración.)
Prior plans: 006 (deudas/installments view), 005 (transactions redesign), 004 (account cards modal), 003 (accounts mgmt), 002 (design system), 001 (monorepo).

<!-- SPECKIT END -->

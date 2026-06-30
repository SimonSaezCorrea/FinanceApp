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

Setup: `apps/api/.env` (`DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, optional `ALPHA_VANTAGE_API_KEY`); `apps/web/.env` (`VITE_API_URL`). See each app's `.env.example`. After install, generate the Prisma client: `pnpm --filter @finance/api exec prisma generate`.

## Architecture (big picture)

**pnpm + Turborepo monorepo** with two separately-deployable apps + shared packages. TypeScript, Node 20. Migrated from the legacy single Next.js app via specs/001.

- **`apps/api`** — **NestJS 10**, the **sole owner of the database** (Prisma 6 / PostgreSQL). Domain-first: `src/domains/<domain>/` each with `*.module/.controller/.service/.repository.ts` (+ `*.spec.ts`). The 10 domains: auth, accounts, transactions, installments, debts, recurring, savings, investments, import, wallet. Cross-cutting in `src/infra/` (`prisma` single client, `auth` `JwtAuthGuard` + `@CurrentUser`, `http` error filter + `ZodValidationPipe`, `config`). Global prefix `/api/v1`.
  - **accounts** (specs/003): `BankAccount` has `type` (`AccountType`: CHECKING/SAVINGS/**VISTA**/CREDIT_CARD/DEBIT_CARD/CASH/OTHER), `status` (`AccountStatus`: ACTIVE/INACTIVE), `initialBalance` (user seed) and reconciled `currentBalance` = initialBalance + Σincome − Σexpense (endpoint `POST /accounts/:id/reconcile`); list filter `?status=active|inactive`; `POST /accounts/:id/status`. List/get also return a per-day `balanceSeries` (30d, reconciled, ends at currentBalance) + `balanceChangePct`, derived from windowed transactions (for sparklines). Deleting unlinks transactions (`onDelete: SetNull`).
  - **cards** (specs/004): `Card` (belongs to a `BankAccount`, `onDelete: Cascade`) — `kind` (`CardKind`: CREDIT/DEBIT), `last4` (**only the last 4 digits are ever transmitted/stored — full PAN never leaves the browser; no CVV**), `expiryMonth`/`expiryYear`, and `CardLimit[]` `{currency, limit, used}` (`@@unique([cardId,currency])`, credit only). Nested endpoints `POST/PATCH/DELETE /accounts/:id/cards[/:cardId]`; `POST /accounts` accepts inline `cards[]`. Display masked as `•••• last4`.
  - **recurring**: `RecurringExpense` (subscriptions/rent/periodic payments) — `frequency` (`RecurrenceFrequency`: WEEKLY/MONTHLY/YEARLY), `interval`, `anchorDate`, optional `bankAccountId`/`category`, `active`. The contract exposes a computed `nextDueAt` (anchor stepped forward by frequency × interval). CRUD at `/recurring`.
  - **wallet**: `WalletItem` `(accountId? | cardId?, order)` — a user-curated set of pinned cards **or** accounts for the dashboard "wallet" (exactly one of card/account; XOR enforced in the service; `onDelete: Cascade`). Endpoints `GET/POST /wallet`, `PATCH /wallet/reorder` (`{ids[]}`), `DELETE /wallet/:id`.
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

Active plan: specs/006-debts-installments-view/plan.md
(Rediseño vistas Deudas e Installments — separadas, no tabs. Debt extiende con totalInstallments/paidInstallments/installmentAmount + endpoint POST /debts/:id/register-payment. Frontend: DebtKpiStrip, DebtCard con progreso, DebtCreateModal, InstallmentPlanCard, PaymentCalendar, InstallmentCreateModal. Backend + frontend.)
Prior plans: 005 (transactions redesign), 004 (account cards modal), 003 (accounts mgmt), 002 (design system), 001 (monorepo).

<!-- SPECKIT END -->

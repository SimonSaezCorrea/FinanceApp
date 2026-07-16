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

- **`apps/api`** — **NestJS 10**, the **sole owner of the database** (Prisma 6 / PostgreSQL). Domain-first: `src/domains/<domain>/` each with `*.module/.controller/.service/.repository.ts` (+ `*.spec.ts`). The 11 domains: auth, accounts, transactions, installments, debts, recurring, savings, investments, import, wallet, reference. Cross-cutting in `src/infra/` (`prisma` single client, `auth` `JwtAuthGuard` + `@CurrentUser`, `http` error filter + `ZodValidationPipe`, `config`). Global prefix `/api/v1`. **DB table names are kebab-case via `@@map`** (e.g. `bank-account`, `card-account`, `wallet-item-dashboard`); Prisma model names stay PascalCase. Auth is **pure JWT email+password** — the NextAuth `Account`/`Session`/`VerificationToken` tables were removed (no OAuth adapter in the API).
  - **accounts** (specs/003, 007): `BankAccount` is **where money or a credit line lives**. `type` (`AccountType`: **CHECKING/SIGHT/SAVINGS/INVESTMENT/CREDIT_LINE/CASH**), `status` (ACTIVE/INACTIVE), optional `accountNumber` (**bank account number — free text, stored/shown in full; NOT a card PAN**), `initialBalance` (seed) + reconciled `currentBalance` = initialBalance + Σincome − Σexpense (`POST /accounts/:id/reconcile`). **A standalone credit card = a `CREDIT_LINE` account**: the credit pool lives on the account as `creditLimit` + `creditUsedInitial` (seed); the contract exposes a **derived `creditUsed` = creditUsedInitial + Σexpense − Σincome** (income = card payments; computed on-read via `sumsByAccount`), `"0"` for non-credit accounts. List filter `?status=active|inactive`; `POST /accounts/:id/status`. List/get also return a 30d `balanceSeries` + `balanceChangePct` (for sparklines). Deleting unlinks transactions (`onDelete: SetNull`).
  - **cards** (specs/004, 007): `CardAccount` (table `card-account`) = the physical **payment instrument** (plastic), **always belongs to a `BankAccount`** (`onDelete: Cascade`) — `kind` (`CardKind`: **CREDIT/DEBIT/PREPAID**), `last4` (**only the last 4 digits ever transmitted/stored — full PAN never leaves the browser; no CVV**), `expiryMonth`/`expiryYear`, `isActive`. **Cards carry no limits** — the credit pool lives on the CREDIT_LINE account and is shared by all its cards (multiple cards on one credit-line account = "secondary/additional cards"). Nested endpoints `POST/PATCH/DELETE /accounts/:id/cards[/:cardId]`; `POST /accounts` accepts inline `cards[]`. Display masked as `•••• last4`.
  - **transactions** (specs/005, 007): income/expense linked to a `BankAccount` and (optionally) a `Card`. Rules in `transactions.service` (contract requires `bankAccountId` on create + refine `INCOME ⇒ no card`): INCOME → no card; EXPENSE on CASH → no card; EXPENSE on **CREDIT_LINE → card required** (must belong) and enforced against the account's `creditLimit` (derived used + amount ≤ limit, tx-excluded on edit via `sumsForAccount`); EXPENSE on other non-cash accounts → card optional. Full CRUD from both the Movements view and the Account view (shared `TransactionTable` with edit/delete). Filter query supports `bankAccountId` + `cardId` (bank→card). Error codes: `CARD_REQUIRED`, `CARD_NOT_ALLOWED`, `CARD_ACCOUNT_MISMATCH`, `CARD_LIMIT_EXCEEDED`.
  - **recurring**: `RecurringExpense` (subscriptions/rent/periodic payments) — `frequency` (`RecurrenceFrequency`: WEEKLY/MONTHLY/YEARLY), `interval`, `anchorDate`, optional `bankAccountId`/`category`, `active`. The contract exposes a computed `nextDueAt` (anchor stepped forward by frequency × interval). CRUD at `/recurring`.
  - **reference** (domain `reference`, global read-only, authed but not user-scoped): `Country` (table `country`, ISO 3166-1 `alpha2`/`alpha3`/`numeric` unique + name), `FinancialInstitution` (table `financial-institution`, **banks + non-bank card issuers** via `kind` `InstitutionKind` BANK/NON_BANK_ISSUER; `code` = SBIF/CMF or código institucional `@@unique([countryId,code])`, `name`, `rut?` (Chilean issuers), `category` `BankCategory?` ESTABLISHED/FOREIGN_BRANCH/STATE (banks only), `brands String[]`, `notes`, FK→Country), `Currency` (table `currency`, **ISO 4217** `code` unique + `numeric` + name), and `CountryCurrency` join (`isPrimary`). Endpoints `GET /countries`, `GET /institutions?country=CL&kind=BANK`, `GET /currencies` (ordered by name). Seeded idempotently in `prisma/seed.ts` (`seedReferenceData`): 6 countries, 18 CL banks + 15 non-bank issuers, 168 currencies, country↔currency links. **`BankAccount.institutionId`** FK → `FinancialInstitution` (the "institution" selector; scalar `institution` text mirrors its name for display; relation field is `financialInstitution`); web forms use `useInstitutions`/`useCurrencies` selects (`domains/reference`).
  - **wallet**: `WalletItemDashboard` (table `wallet-item-dashboard`) `(accountId? | cardId?, order)` — a user-curated set of pinned cards **or** accounts for the dashboard "wallet" (exactly one of card/account; XOR enforced in the service; `onDelete: Cascade`). Endpoints `GET/POST /wallet`, `PATCH /wallet/reorder` (`{ids[]}`), `DELETE /wallet/:id`.
- **`apps/web`** — **Vite + React 18 SPA**, consumes the API over HTTP only (`shared/lib/apiClient.ts`, `VITE_API_URL`). Domain-first: `src/domains/<domain>/{api,hooks,components,routes}`. Routing react-router, data via TanStack Query, **owns the es/en i18n catalogs** (`src/i18n`). **Styling: Tailwind CSS** (design tokens as CSS variables in `src/styles/index.css`, dark-mode ready) with shadcn-style primitives in `src/shared/ui` (`button`, `input`, `label`, `field`, `select`, `card`, `badge`, `table`, `page-header`, `states`, `theme-toggle`, `switch`, `dialog` [Radix], `confirm-dialog` [Radix, optional `children` slot for extra confirmation fields], `tabs`, `segmented`, `sparkline`) + `cn` helper (`shared/lib/cn.ts`); authed routes wrapped by `app/AppLayout.tsx`. The **Panel** (`app/DashboardPage.tsx` + `domains/dashboard`) is a frontend-only aggregation (net worth, month flow, category donut, upcoming payments, wallet). Libraries: **Recharts** (charts), **sonner** (toasts; `<Toaster/>` in `app/providers`), **@dnd-kit** (wallet drag-reorder). No DB access, never imports backend internals.
- **`packages/`** — `contracts` (zod schemas + inferred types = the API contract; one module per domain; built to dist CJS + `import` condition → src for Vite), `money` (`decimal.js`: money helpers, `equalPrincipalSchedule`, interest), `config` (shared `tsconfig.base.json`). One-way deps: `apps → packages`; `api ↛ web`; `packages ↛ apps` (enforced by `check:boundaries`).
- **Auth:** backend issues **JWT access+refresh tokens in httpOnly cookies** (`domains/auth`); `JwtAuthGuard` validates the access cookie **and** (per-request DB check) that the account's `status` is still `ACTIVE`, rejecting `DISABLED` accounts (`ACCOUNT_DISABLED`) even with an otherwise-valid token. Every endpoint is scoped to the authenticated `userId`. The frontend `AuthProvider`/`useAuth` + `RequireAuth` gate routes.
  - **profile** (specs/008, folded into the `auth` domain — no separate backend module, `User` already lives there): `User` gains `preferredCurrency` (CLP/USD/EUR), `locale` (es/en), `dateFormat`, `theme` (dark/light/system — same preference the sidebar `ThemeToggle` controls, now persisted per-user in addition to `localStorage`), `status` (`UserStatus`: ACTIVE/DISABLED), `createdAt` (→ contract's derived `memberSinceYear`). Endpoints: `PATCH /auth/me` (name/email, unique-email race guarded by catching Prisma `P2002` in addition to the pre-check), `POST /auth/me/password` (current+new, bcrypt), `PATCH /auth/me/preferences`, `POST /auth/me/deactivate` (requires re-entering the password; soft-disables the account — no data is deleted; clears cookies like `logout`). Frontend: new `domains/profile` (route `/profile`, reached by clicking the sidebar user block), `ThemeSync` component reconciles the shared theme preference between `localStorage` and the backend. New error codes `INVALID_CURRENT_PASSWORD`, `ACCOUNT_DISABLED`. 2FA switch + the 3 notification switches shown in the design are **intentionally inert** (local UI state only, no backend capability yet).
    Amendment (personal info): `User` also gains `countryId` (FK → `Country`, `onDelete: SetNull`), `addressStreet`/`addressCity`/`addressRegion`/`addressPostalCode` (all free text), `birthDate`, `identifierType` (`IdentifierType`: RUT/DNI/PASSPORT/OTHER) + `identifierValue`. All optional, purely informational (no billing/KYC flow consumes them yet). `identifierValue` is check-digit validated (`isValidRut`, módulo 11) only when `identifierType === "RUT"` — other types have no universal format to validate. The contract exposes both `birthDate` (ISO date string, for the edit form) and a derived `age`; the Profile view only ever renders `age` (hiding the exact date is a UI choice, not an API one). `packages/contracts` gained its own Vitest suite (`"test": "vitest run"`) for this validator — it previously had none.
    Which `identifierType`(s) a country supports is **data, not a fixed global list** — a country may
    support more than one (e.g. a national id + passport): `CountryIdentifierType` (table
    `country-identifier-type`, mirrors `CountryCurrency`'s shape) joins `Country` ↔ `IdentifierType`
    with an `isPrimary` flag. `identifierTypeSchema` moved to `reference` (it's reference/lookup
    vocabulary, not auth-specific); `reference.Country` now also exposes `identifierTypes` (primary
    first). The web edit form derives its identifier-type options from the selected country
    (falling back to all types when no country is set, e.g. pre-existing data) instead of a
    hardcoded list. Seeded: CL→RUT+PASSPORT, AR/CO/PY/PE→DNI+PASSPORT, PR→PASSPORT+OTHER.
    Amendment (full profile redesign, `design_handoff_financeapp/prototypes/Perfil.dc.html`): `User`
    also gains `phone`, `hideBalances` (real — masks amounts via the new `domains/profile/components/
    MaskedAmount.tsx`, wired into `NetWorthCard`/`AccountVisualCard`; **partial coverage**, not every
    money label app-wide — see `docs/PENDING.md`), `monthlyBudgetTarget` (money,
    `moneyString`/`moneyToString`), `billingCycleStartDay` (1-28, not yet wired into any "this month"
    calculation), `extraCurrencies` (`String[]`, a selection with **no live FX conversion**),
    `budgetAlertThreshold` (%, drives the Notifications threshold slider, no real alert sent).
    New shared primitive `shared/ui/collapsible-section.tsx` (closed by default) — all Profile config
    sections are now collapsible accordions. New sections: `AccountStatusSection` (completeness ring —
    reflects whether email/identifier/phone are filled in, NOT real verification; profile photo is
    always incomplete, no upload capability), `FinancialCustomizationSection`, `PlanBillingSection` and
    `DataPrivacySection` (both **pure placeholders** — fixed example data, every action a no-op:
    billing/plans, open-banking bank sync, data export, and automated backup are out of scope, no
    infra exists). `SecuritySection` also gained a disabled passkey (WebAuthn) row and a local-only
    example sessions/devices list (no real session tracking exists — auth is still stateless JWT).
    Every non-functional piece introduced by this amendment is catalogued in
    `docs/PENDING.md` — consult it before assuming any of the above is wired to a
    real backend.

- **Errors:** the API returns **language-agnostic codes** `{ error: { code, field? } }` (never localized prose); the frontend maps `code` → `errors.<CODE>` in es/en. `AllExceptionsFilter` (`infra/http`) preserves the specific `code`/`field` thrown on the exception (e.g. `EMAIL_TAKEN`, `CARD_REQUIRED`) and only falls back to a generic status-derived code (`UNAUTHORIZED`, `CONFLICT`, …) when the exception carried none — a prior version of this filter discarded every domain-specific code and must not regress.

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

Active plan: specs/008-user-profile/plan.md
(Perfil de Usuario. User gana preferredCurrency/locale/dateFormat/theme/status(UserStatus)/createdAt.
Dominio auth extendido (no domain nuevo en backend): PATCH /auth/me, POST /auth/me/password,
PATCH /auth/me/preferences, POST /auth/me/deactivate. JwtAuthGuard + rotateFromRefresh rechazan
cuentas DISABLED. Frontend: nuevo domains/profile (ruta /profile), nuevo primitivo shared/ui/switch,
ThemeProvider sincroniza tema con backend además de localStorage, sidebar user-block clicable.
Nuevos error codes INVALID_CURRENT_PASSWORD, ACCOUNT_DISABLED.)
Prior plans: 007 (accounts/movements redesign), 006 (deudas/installments view), 005 (transactions redesign), 004 (account cards modal), 003 (accounts mgmt), 002 (design system), 001 (monorepo).

<!-- SPECKIT END -->

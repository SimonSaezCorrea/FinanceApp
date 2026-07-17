<!--
Sync Impact Report — 2026-07-16 (amendment 1.12.0)
- Version change: 1.11.0 → 1.12.0 (MINOR: full profile-page redesign from a definitive design file,
  specs/008 "Perfil de Usuario"; also records a new durable workflow convention). Core Principles
  unchanged in intent.
- Technology & Operational Constraints:
  - `User` gains `phone`, `hideBalances` (real, partial coverage), `monthlyBudgetTarget` (money),
    `billingCycleStartDay`, `extraCurrencies` (`String[]`, selection only — no live FX), and
    `budgetAlertThreshold` (%, UI-only threshold). New shared primitive `shared/ui/collapsible-
    section.tsx` — Profile's configuration sections are now collapsible accordions, closed by default.
  - New sections `PlanBillingSection` and `DataPrivacySection` are **intentionally pure placeholders**
    (fixed example data, every action a no-op) — billing/plans, open-banking bank sync, data export,
    and automated backups are out of scope; no infrastructure for any of them exists in this project.
    `SecuritySection` similarly gained inert passkey/sessions rows.
- **New Development Workflow convention (Principle V extension)**: when a feature ships a
  visually-complete but non-functional/placeholder section, or a feature with only partial coverage
  (e.g. a preference wired into some but not all applicable call sites), it MUST be catalogued in
  **`docs/PENDING.md`** (a single project-wide living document, not one per feature — it's project
  history, not spec content) — what looks real but isn't, and what "real" would require. This is not
  optional documentation; silently shipping a convincing-looking no-op is a defect class this
  constitution now explicitly guards against (see `docs/PENDING.md`'s "Perfil de usuario" section for
  the reference example).

Sync Impact Report — 2026-07-16 (amendment 1.11.0)
- Version change: 1.10.0 → 1.11.0 (MINOR: major stack-version bump — NestJS 10 → 11 (Express 5) —
  dependabot PR #5, evaluated then implemented). Core Principles unchanged in intent.
- **NestJS 11 / Express 5**: `@nestjs/jwt`'s `JwtSignOptions.expiresIn` is now `jsonwebtoken`'s own
  `StringValue | number` (from the `ms` package) instead of a generic `string`, breaking
  `AuthService.issueTokens` (`apps/api/src/domains/auth/auth.service.ts`) — fixed with a small
  `expiresIn()` helper that types the env-sourced duration string as `StringValue`. Verified against
  a real server, not just CI: login, `/auth/me`, a real nested `:id` route, and the refresh-token
  rotation flow all worked end-to-end (JWT sign/verify, httpOnly cookies). No route in this codebase
  uses wildcard or optional-segment patterns, so Express 5's path-to-regexp changes don't apply here.

Sync Impact Report — 2026-07-16 (amendment 1.10.0)
- Version change: 1.9.0 → 1.10.0 (MINOR: major stack-version bump — React 18 → 19, react-i18next 15 → 17
  — dependabot PR #8, evaluated then implemented). Core Principles unchanged in intent.
- **React 19**: `apps/web` bumped straight through — no compatibility shims needed (typecheck, all 67
  unit/component tests, and build were clean with no source changes). Manually smoke-tested in a real
  browser against the real API/DB: login, every domain route (Panel, Cuentas, Movimientos, Cuotas,
  Deudas, Ahorros, Inversiones), and the sidebar theme toggle — all rendered and behaved correctly.
- **i18next 26**: dependabot's `react-i18next` group bump (15 → 17) required `i18next >= 26.2.0` as a
  peer, but the group didn't include `i18next` itself (left at 24.2.0) — a dependabot grouping gap, not
  a real conflict. Bumped `i18next` to `^26.3.6` alongside it; resolves the `keyFromSelector` export
  error that otherwise broke 10 test suites.

Sync Impact Report — 2026-07-16 (amendment 1.9.0)
- Version change: 1.8.0 → 1.9.0 (MINOR: major stack-version bump — Prisma 6 → 7 — dependabot PR #9,
  evaluated then implemented). Core Principles unchanged in intent.
- **Prisma 7**: `datasource.url` in `schema.prisma` is no longer accepted (Prisma 7 breaking change).
  `apps/api` now connects via the **`@prisma/adapter-pg`** driver adapter, constructed with
  `DATABASE_URL` (read through `ConfigService`) and passed to the `PrismaClient`/`PrismaService`
  constructor; the CLI (validate/generate/db push) reads the same `DATABASE_URL` via a new
  `apps/api/prisma.config.ts` (`defineConfig` + `env()` from `prisma/config`). `apps/api/prisma/seed.ts`
  constructs its own adapter identically. `prisma db push` no longer accepts `--skip-generate`
  (removed in Prisma 7); `scripts/db-reset.mjs` updated accordingly. No schema/model changes — this is
  a connection-mechanism migration only, verified against a real Postgres instance (db push + seed +
  a live query), not just CI.

Sync Impact Report — 2026-07-15 (amendment 1.8.0)
- Version change: 1.7.0 → 1.8.0 (MINOR: corrects the 1.7.0 identifier-type design before it shipped
  further — same specs/008 feature, not a new one). Core Principles unchanged in intent.
- Technology & Operational Constraints:
  - Which national-identity document type(s) a country supports is now **data**, not a fixed global
    enum list assumed valid everywhere: new join `CountryIdentifierType` (mirrors `CountryCurrency`'s
    `Country ↔ Currency` shape exactly — `countryId` + `identifierType` + `isPrimary`, unique pair).
    A country may support more than one type (e.g. RUT + passport). `identifierTypeSchema` moved from
    `auth` to `reference` (packages/contracts) — it's reference/lookup vocabulary shared by `Country`
    and `User`, not auth-specific. `reference.Country` now exposes `identifierTypes` (primary first).
  - The web edit form's identifier-type options now come from the selected country's own
    `identifierTypes`, falling back to the full vocabulary only when no country is set (covers
    pre-existing data saved before a country was chosen). Seeded via the same
    country↔currency-link pattern in `prisma/seed.ts`.

Sync Impact Report — 2026-07-15 (amendment 1.7.0)
- Version change: 1.6.0 → 1.7.0 (MINOR: personal-info expansion of specs/008 "Perfil de Usuario" —
  country/address/birth date/national identifier). Core Principles unchanged in intent.
- Technology & Operational Constraints:
  - `User` gains `countryId` (FK → `Country`, reusing the existing reference table), structured
    address (`addressStreet`/`addressCity`/`addressRegion`/`addressPostalCode`, all free text),
    `birthDate`, and a generalized national-identity pair `identifierType` (`IdentifierType`:
    RUT/DNI/PASSPORT/OTHER) + `identifierValue` — not a Chile-only `rut` field, to support users
    identifying with other countries' documents too. All optional; purely informational today (no
    billing/KYC feature consumes them).
  - **New validation rule**: `identifierValue` is check-digit validated (módulo 11) only when
    `identifierType === "RUT"` (`packages/contracts/src/auth/rut.ts`, `isValidRut`). Other identifier
    types have no universal format and are accepted as free text.
  - **Contract exposes both a derived and a raw form of the same fact**: `birthDate` (ISO date string)
    for edit-form hydration, and `age` (derived) for display. The Profile view only ever renders `age`
    — precedent: hiding a sensitive exact value from the default view is a **UI** choice, the API
    still returns the real data to the account's own authenticated owner (no server-side redaction of
    a user's own data).
  - **`packages/contracts` gained a Vitest suite** (`"test": "vitest run"`, `vitest` devDependency) —
    it previously had none, unlike `apps/api`, `apps/web`, and `packages/money`. Closes that gap for
    this package going forward; new contract-level validators (like `isValidRut`) belong here.

Sync Impact Report — 2026-07-15 (amendment 1.6.0)
- Version change: 1.5.1 → 1.6.0 (MINOR: new user-facing capability from specs/008 "Perfil de Usuario"
  — data-model + auth-mechanism expansion). Core Principles unchanged in intent.
- Technology & Operational Constraints:
  - `User` gains `preferredCurrency`, `locale`, `dateFormat`, `theme`, `status` (`UserStatus`:
    ACTIVE/DISABLED), `createdAt`. No new backend domain/module — folded into the existing `auth`
    domain, since `User` already lives there and no other responsibility justifies a separate module.
  - **Account deactivation is a real auth-mechanism change**: `JwtAuthGuard` now performs a per-request
    DB check (`status === ACTIVE`) in addition to JWT signature verification, and `AuthService.
    validateCredentials`/`rotateFromRefresh` reject `DISABLED` accounts (`ACCOUNT_DISABLED`). A prior
    behavior where a disabled account could keep using an already-issued access token until its
    natural ~15min expiry is explicitly rejected — deactivation must take effect on the account's next
    authenticated request, not wait for token expiry.
  - New endpoints on `auth`: `PATCH /auth/me`, `POST /auth/me/password`, `PATCH /auth/me/preferences`,
    `POST /auth/me/deactivate` (soft-disable only — no data deletion; a defense-in-depth Prisma `P2002`
    catch guards the email-uniqueness pre-check against a concurrent-write race). New error codes
    `INVALID_CURRENT_PASSWORD`, `ACCOUNT_DISABLED`.
  - **Bugfix recorded as a constraint going forward**: `AllExceptionsFilter` (`infra/http`) previously
    discarded every domain-specific error `code` thrown on an exception, replacing it with a generic
    status-derived code (e.g. a real `EMAIL_TAKEN` conflict reached the client as plain `CONFLICT`).
    Fixed to preserve the thrown `{code, field}` when present, falling back to the generic mapping only
    when none was thrown. This must not regress — it silently broke every specific error code app-wide,
    not just this feature's.
  - Frontend gains a new domain `apps/web/src/domains/profile` (route `/profile`) and a new shared
    primitive `shared/ui/switch.tsx`. The theme preference (previously `localStorage`-only) is now also
    persisted per-user server-side; `localStorage` remains the pre-auth/first-paint source of truth.

Sync Impact Report — 2026-07-02 (amendment 1.5.0)
- Version change: 1.4.0 → 1.5.0 (MINOR: revised accounts/cards model — supersedes the 1.4.0
  secondary-card sub-limit design before it shipped). Core Principles unchanged in intent.
- Technology & Operational Constraints (accounts/cards/transactions):
  - `AccountType` enum redefined: **CHECKING, SIGHT, SAVINGS, INVESTMENT, CREDIT_LINE, CASH**
    (removed VISTA→SIGHT, CREDIT_CARD/DEBIT_CARD/OTHER; added INVESTMENT, CREDIT_LINE).
  - **A standalone credit card is modeled as a `CREDIT_LINE` account** (the credit line lives in the
    account). The credit pool moved from the card to the account: `BankAccount.creditLimit` +
    `creditUsedInitial` (seed); derived `creditUsed = creditUsedInitial + Σexpense − Σincome`.
  - `Card` is now a pure payment instrument (plastic) that ALWAYS belongs to an account: `kind`
    (`CardKind`: CREDIT/DEBIT/**PREPAID**), `isActive`; **`CardLimit` model removed**, and the 1.4.0
    `parentCardId`/sub-limit secondary mechanism removed (secondaries = multiple cards on one
    credit-line account sharing its pool). Error codes reduced to CARD_REQUIRED, CARD_NOT_ALLOWED,
    CARD_ACCOUNT_MISMATCH, CARD_LIMIT_EXCEEDED (dropped CARD_SUBLIMIT_EXCEEDED, PARENT_CARD_INVALID).
  - Transactions: EXPENSE on a CREDIT_LINE account requires a card and is enforced against the
    account's credit pool; on other non-cash accounts the card is optional.
  - **Docker dev DB + reset workflow:** added `docker-compose.yml` (Postgres) and `pnpm db:reset`
    (`scripts/db-reset.mjs`) — destroy volume → recreate → `db push` → seed. Still no migrations folder.
  - **Persistence naming rule (1.5.1):** DB tables are **kebab-case via `@@map`** (models stay
    PascalCase). Renamed models `Card → CardAccount`, `WalletItem → WalletItemDashboard`. Removed the
    dead NextAuth tables (`Account`/`Session`/`VerificationToken`) — auth is JWT email+password only.
    Rule recorded under Architecture norms.

Sync Impact Report — 2026-07-02 (amendment 1.4.0)
- Version change: 1.3.0 → 1.4.0 (MINOR: data-model + business-rule expansion from specs/007
  "Rediseño Cuentas y Movimientos con tarjetas secundarias"). Core Principles unchanged in intent.
- Technology & Operational Constraints (accounts/cards/transactions domains):
  - `BankAccount` gains `accountNumber` (bank account number — free text, stored/shown in full; the
    "only last-4 / no PAN/CVV" rule applies ONLY to `Card`).
  - `Card` gains a self-relation `parentCardId` (secondary/additional cards, one level, onDelete Cascade).
    A secondary CREDIT card shares its primary's credit pool with its own sub-limit; a secondary DEBIT
    card is just another card on the same account (no pool).
  - `CardLimit.used` (previously a stored, user-set value) is replaced by `initialUsed` (seed) + a
    DERIVED reconciled `used = initialUsed + Σ credit EXPENSE`; a primary aggregates its secondaries.
    Mirrors the account initialBalance/currentBalance pattern (Principle I still holds — decimal only).
  - Transactions: bank required on new movements; non-cash EXPENSE requires a card, INCOME/cash forbid one;
    credit expenses enforced against sub-limit + shared pool. New language-agnostic error codes: CARD_REQUIRED,
    CARD_NOT_ALLOWED, CARD_ACCOUNT_MISMATCH, CARD_LIMIT_EXCEEDED, CARD_SUBLIMIT_EXCEEDED, PARENT_CARD_INVALID.
  - DB workflow note: the repo currently has no `prisma/migrations` folder and syncs schema via
    `prisma db push` ("Database schema is up to date"); the specs/007 schema change was applied with a
    data-preserving SQL backfill (`initialUsed = used`) then `db push`.

Sync Impact Report — 2026-06-21 (amendment 1.3.0)
- Version change: 1.2.0 → 1.3.0 (MINOR: recorded post-merge reality — monorepo merged to `main`;
  two new business domains (recurring, wallet); the design-system redesign and its approved
  frontend libraries). Core Principles unchanged in intent.
- Technology & Operational Constraints:
  - Business domains expanded from 8 to 10: added **recurring** (RecurringExpense — subscriptions/
    rent/periodic payments, next-due computed) and **wallet** (WalletItem — user-curated dashboard
    cards/accounts, drag-reorder). accounts now also exposes a per-day `balanceSeries` + `balanceChangePct`.
  - Approved frontend libraries recorded: **Recharts** (charts), **sonner** (toasts), **@dnd-kit**
    (drag-and-drop), **Geist** via `@fontsource-variable/geist` (typography). Design tokens gained the
    **clay `--accent`** channel.
  - Migration status: specs/001 monorepo **merged to `main`** (PR #1); legacy Next.js app removed.
- Known drift (pending wording refresh, not a behavior change): Principles II and III still cite
  legacy Next.js specifics (`app/api/**/route.ts`, `auth()`, `messages/*.json`, `next/link`,
  `@/i18n/navigation`). Intent holds; the mechanisms are now NestJS `JwtAuthGuard`/`@CurrentUser`
  and the web app's `src/i18n` es/en catalogs.

Sync Impact Report — 2026-06-14 (amendment 1.2.0)
- Version change: 1.1.0 → 1.2.0 (MINOR: added explicit, enforced Architecture norms — domain-first,
  one-source-of-truth shapes, one-way deps via check:boundaries, zod validation; updated Definition
  of Done to the real gates; migration now implemented on branch 001, pending merge). Principles unchanged.

Sync Impact Report — 2026-06-14 (amendment 1.1.0)
- Version change: 1.0.0 → 1.1.0 (MINOR: redefined Technology & Operational Constraints to the
  ratified target architecture; recorded Vitest as the chosen test runner). Core Principles
  unchanged. Driven by specs/001-api-frontend-monorepo (plan approved).
- Technology & Operational Constraints: now describes the target monorepo (apps/api NestJS +
  apps/web Vite/React + packages/* shared) with pnpm+Turborepo and backend-issued JWT (httpOnly).
  Migration is tracked by specs/001 and performed on a dedicated branch; the pre-migration single
  Next.js app remains on `main` until that branch passes its done-state and merges.
- Principle IV: Vitest selected as the single runner — the chosen means to close TODO(TEST_RUNNER)
  (still open until set up during the migration).

Sync Impact Report — initial ratification
- Version change: (template) → 1.0.0
- Ratification: initial adoption (first ratification)
- Principles defined:
  1. Money Precision (NON-NEGOTIABLE)
  2. Per-User Data Isolation (NON-NEGOTIABLE)
  3. i18n Parity (NON-NEGOTIABLE)
  4. Test-First / TDD (NON-NEGOTIABLE) — current gap recorded: no test runner yet
  5. Spec-Driven Development & Living Memory (NON-NEGOTIABLE)
- Added sections: Technology & Operational Constraints; Development Workflow & Quality Gates; Governance
- Removed sections: none (template placeholders replaced)
- Templates reviewed:
  ✅ .specify/templates/plan-template.md — Constitution Check gate is generic; compatible
  ✅ .specify/templates/spec-template.md — no constitution-driven mandatory sections to change
  ✅ .specify/templates/tasks-template.md — task categories compatible (testing tasks supported)
  ✅ CLAUDE.md — SDD + memory-sync rule already present and aligned
- Deferred TODOs:
  ⚠ TODO(TEST_RUNNER): no test runner configured in the repo. Principle IV (TDD) is the
    mandated standard but is NOT yet satisfied. Set up a test runner (e.g. Vitest) before
    or as the first task of the next feature, then drop this note.
-->

# FinanceApp Constitution

FinanceApp is a personal-finance web application (individual/household use) for tracking
income and expenses, installments, debts, savings goals, bank accounts, investments (ETF +
remunerated accounts), and Excel import. This constitution encodes the non-negotiable
principles and operating rules that every spec, plan, and implementation MUST honor. The
code is the source of truth; this document governs how the code is allowed to change.

## Core Principles

### I. Money Precision (NON-NEGOTIABLE)

All monetary values MUST use `decimal.js` in business logic and `Prisma.Decimal` in
persistence, at the schema-defined precisions (e.g. `Decimal(18,4)`). Floating-point
arithmetic on money (JavaScript `number` for amounts, rates, or balances) is FORBIDDEN.
Rounding MUST be explicit and consistent with the stored precision.

Rationale: a finance app is only trustworthy if totals reconcile to the cent. Binary
floats silently lose precision and corrupt balances, interest, and amortization.

### II. Per-User Data Isolation (NON-NEGOTIABLE)

Every data read and write MUST be scoped by `session.user.id`. API route handlers
(`app/api/**/route.ts`) MUST call `auth()` and return `401` when there is no valid session
(the locale/auth middleware does not protect `api` routes). No query may return, and no
mutation may touch, another user's data.

Rationale: financial data is sensitive and personal. A single unscoped query is a data
breach. Isolation is enforced at every entry point, not assumed.

### III. i18n Parity (NON-NEGOTIABLE)

Every user-facing string MUST exist in BOTH `messages/es.json` and `messages/en.json` under
identical keys. Locale-aware navigation MUST use `@/i18n/navigation` (`Link`, `redirect`);
bare `next/link` for internal routes is FORBIDDEN. Default locale is `es`; `localePrefix` is
`always`.

Rationale: the app ships Spanish and English as first-class. A key present in one catalog
but missing in the other is a user-visible defect (raw key or crash).

### IV. Test-First / TDD (NON-NEGOTIABLE)

Tests are written before implementation and follow Red-Green-Refactor: write a failing test,
make it pass, refactor. Financial logic (`lib/finance/**`) MUST have unit tests covering the
money rules in Principle I.

Current-state note (MUST be closed): the repository has **no test runner configured yet**.
**Vitest** is the chosen runner (ratified with specs/001); until it is set up during the
monorepo migration, this principle is the mandated standard but is **not yet satisfied** — see
`TODO(TEST_RUNNER)` in the Sync Impact Report.

Rationale: correctness in money math cannot be verified by eye. TDD makes the intended
behavior executable and prevents regressions in the most consequential code.

### V. Spec-Driven Development & Living Memory (NON-NEGOTIABLE)

Features MUST be built through the Spec Kit lifecycle, orchestrated by the `/sdd` skill:
constitution → specify → clarify → plan → checklist → tasks → analyze → implement. There is
NO implementation without an approved spec → plan → tasks chain.

On ANY relevant change — new dependency, new convention, schema/data-model change, new env
var, new command, routing/auth change, or a new/amended principle — BOTH this constitution
AND `CLAUDE.md` MUST be updated in the SAME session. Stale documentation is a defect, not a
follow-up.

Rationale: the spec is the shared contract; skipping it produces code nobody agreed to.
The constitution and `CLAUDE.md` are the project's durable memory — if they drift from
reality, every future decision is made on false information.

## Technology & Operational Constraints

- **Target architecture (ratified — specs/001):** a **pnpm + Turborepo monorepo** with two
  separately deployable apps and shared packages:
  - `apps/api` — **NestJS** backend, **Prisma 7 / PostgreSQL** (sole DB owner, connected via the
    **`@prisma/adapter-pg` driver adapter** + `prisma.config.ts` — Prisma 7 no longer accepts a
    `datasource.url` in `schema.prisma`), domain-first modules; auth issues **JWT access+refresh
    tokens in httpOnly cookies**.
  - `apps/web` — **Vite + React 19 SPA**, domain-first features, consumes the API over HTTP only;
    **owns the es/en i18n catalogs** (the API returns data + language-agnostic error codes).
  - `packages/*` — shared **contracts** (zod schemas + types), **money** (`decimal.js`),
    config. One-way deps: apps → packages; `api ↛ web`.
  - **Testing:** **Vitest** across apps and packages.
- **Architecture norms (NON-NEGOTIABLE, enforced):**
  - **Domain-first:** both apps organize code under `src/domains/<domain>/`; the backend follows the
    `module → controller → service → repository` skeleton (the repository is the only Prisma touchpoint
    and always scopes by `userId`). New domains mirror this skeleton.
  - **One source of truth for shapes:** request/response models are zod schemas in
    `@finance/contracts` (flat interfaces via `@finance/contracts/models`); money math lives in
    `@finance/money`. The Prisma schema (`apps/api/prisma`) is the only persistence model.
  - **One-way dependencies:** `apps → packages`; `packages ↛ apps`; `api ↛ web`. Enforced by
    `pnpm check:boundaries` (the frontend must not import backend internals or any DB client).
  - **Validation with zod** (`ZodValidationPipe`), not class-validator.
  - **Persistence naming:** Prisma **model** names are PascalCase; the physical **DB table** name MUST
    be **kebab-case via `@@map`** (e.g. `BankAccount` → `bank-account`, `CardAccount` → `card-account`,
    `WalletItemDashboard` → `wallet-item-dashboard`). Every model carries an `@@map`. No unused/legacy
    tables: auth is JWT email+password only (no NextAuth `Account`/`Session`/`VerificationToken`).
- **Business domains (current — 11):** backend `apps/api/src/domains/*`: `reference` (global read-only
  countries + financial institutions [banks + non-bank card issuers via `FinancialInstitution.kind`] +
  currencies — ISO 3166-1 + ISO 4217; `BankAccount.institutionId` FK), `auth`, `accounts`
  (incl. `cards` + a per-day `balanceSeries`/`balanceChangePct`), `transactions`, `installments`,
  `debts`, `recurring` (recurring expenses — subscriptions/rent/periodic payments; next-due computed
  from anchor + frequency × interval), `savings`, `investments`, `import`, `wallet` (user-curated set
  of pinned cards/accounts shown on the dashboard, manually ordered). The dashboard (Panel) is a
  frontend-only aggregation over these domains. New domains mirror the module skeleton.
- **Approved frontend libraries:** charts via **Recharts**; toasts via **sonner**; drag-and-drop via
  **@dnd-kit** (`core`/`sortable`/`utilities`); typography **Geist** (`@fontsource-variable/geist`).
  Design tokens include the **clay `--accent`** channel (HSL, dark/light). Adding a new runtime
  dependency is a Principle V change (record it here and in `CLAUDE.md` the same session).
- **Migration status:** the specs/001 monorepo migration has **merged to `main`** (PR #1); the legacy
  single Next.js app is removed. (Principles II–III still use legacy Next.js phrasing — see the latest
  Sync Impact Report; intent is unchanged, mechanisms are now NestJS guard + the web `src/i18n` catalogs.)
- **Environment:** per `.env.example` — `DATABASE_URL`, JWT secrets, CORS origin (api), and
  `VITE_API_URL` (web); optional `GOOGLE_CLIENT_*`, `ALPHA_VANTAGE_API_KEY`. Secrets MUST NOT be
  committed; `.env` stays out of version control.
- **Major stack changes** (framework, ORM, auth strategy, package manager, monorepo tooling) are
  governance amendments and require a version bump here plus a `CLAUDE.md` update.

## Development Workflow & Quality Gates

- **SDD review gates:** the spec is reviewed and approved before planning; the plan is
  reviewed and approved before tasks; `/speckit-analyze` runs and its findings are resolved
  before `/speckit-implement`.
- **Definition of done:** `pnpm check:boundaries`, `pnpm typecheck`, `pnpm test`, and `pnpm build`
  MUST pass; money/finance logic in `packages/money` is covered by tests.
- **Ambiguity:** when scope, a tech choice, or acceptance criteria are unknown, STOP and ask
  the user — do not guess. (Enforced by the `/sdd` orchestrator.)
- **Memory sync:** every cycle ends by reconciling this constitution and `CLAUDE.md` with what
  actually changed.
- **No silent placeholders:** a feature MAY ship a visually-complete but non-functional section, or a
  preference wired into only some applicable call sites — but it MUST be catalogued in
  **`docs/PENDING.md`** (project-wide, not per-feature) with what looks real but isn't, and what
  "real" would require. Convincing-looking no-ops that aren't documented are a defect, not a shortcut.

## Governance

This constitution supersedes ad-hoc practices. When a principle and a convenience conflict,
the principle wins, or the principle is formally amended — not silently ignored.

- **Amendment (pragmatic):** a single maintainer MAY amend this document by (a) editing the
  relevant section, (b) documenting the change in the Sync Impact Report, and (c) bumping the
  version. No multi-party approval ceremony is required, but the change MUST be recorded.
- **Versioning (semver):** MAJOR = backward-incompatible principle removal/redefinition;
  MINOR = new principle/section or materially expanded guidance; PATCH = clarifications and
  wording.
- **Compliance:** complexity MUST be justified against the principles. `CLAUDE.md` is the
  runtime guidance file and MUST be kept in sync with this constitution (Principle V).

**Version**: 1.12.0 | **Ratified**: 2026-06-14 | **Last Amended**: 2026-07-16

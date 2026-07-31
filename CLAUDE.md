# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Canonical reference

`docs/{english,spanish}/APP_CONTEXT_AND_HISTORY.md` documents the product vision, data model, and business rules
(written for the original Next.js app — predates the monorepo migration; treat its stack/routing
details as historical, the domain/business rules still apply). `docs/english/ARCHITECTURE.md`
(+ `docs/spanish/`) and `specs/001-api-frontend-monorepo/` are authoritative for the current
monorepo structure. `docs/{english,spanish}/BANKING_LOGIC.md` is a narrative deep-dive on the
accounts/cards/credit-pool/transactions domain rules (account types, the primary-card-mirrors-account
credit model, multi-currency pools, transaction validation, error codes) — read it before making
changes in that area instead of reverse-engineering the rules from code. Code is the source of truth.

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

- **`apps/api`** — **NestJS 11** (Express 5), the **sole owner of the database** (Prisma 7 / PostgreSQL, connected via the `@prisma/adapter-pg` driver adapter — Prisma 7 no longer accepts a `datasource.url` in `schema.prisma`; the connection string lives in `apps/api/prisma.config.ts` (CLI) and is passed to `PrismaService`'s constructor via `ConfigService` (app runtime); `prisma/seed.ts` builds its own adapter the same way). **Table-first: one DB table = one folder under `src/domains/<table>/`** (kebab-case, matching the table's `@@map`), each split into the four DDD layers `domain/`, `application/`, `infrastructure/`, `presentation/` (specs/009 + the one-table-one-domain amendment below; the old flat `*.service.ts`/`*.repository.ts` skeleton is gone, and tests live in `apps/api/test/{unit,integration,e2e}/` mirroring `src/`). The 21 table-domains: bank-account, billing-settings, credit-statement, card-account, card-limit, transaction, wallet-item-dashboard, installment-plan, installment-payment, debt, savings-goal, savings-entry, recurring-expense, investment, etf-price-cache, user, country, currency, country-currency, country-identifier-type, financial-institution — plus `import` and `health`, the only folders that own no table. Cross-cutting in `src/infra/` (`prisma` single client, `auth` `JwtAuthGuard` + `@CurrentUser`, `http` error filter + `ZodValidationPipe`, `config`, `cron` scheduled automations via `@nestjs/schedule` — each `*.cron.ts` is a thin trigger dispatching a `scope: "system"` command into its domain, e.g. `billing-generation.cron.ts` → `credit-statement`'s `GenerateAllDueStatementsCommand`). Global prefix `/api/v1`. **DB table names are kebab-case via `@@map`** (e.g. `bank-account`, `card-account`, `wallet-item-dashboard`); Prisma model names stay PascalCase. Auth is **pure JWT email+password** — the NextAuth `Account`/`Session`/`VerificationToken` tables were removed (no OAuth adapter in the API).
  - **bank-account** (specs/003, 007; the aggregate root of the accounts cluster — `card-account`/`card-limit`/`billing-settings`/`credit-statement` are its own table-domains, written only through it): `BankAccount` is **where money or a credit line lives**. `type` (`AccountType`: **CHECKING/SIGHT/SAVINGS/INVESTMENT/CREDIT_LINE/CASH**), `status` (ACTIVE/INACTIVE), `accountNumber` (**bank account number — free text, stored/shown in full; NOT a card PAN**; **required for CHECKING/SIGHT/SAVINGS**, optional for CREDIT_LINE/INVESTMENT/CASH — enforced via a zod refine on create and by the aggregate on update, `ACCOUNT_NUMBER_REQUIRED`), `initialBalance` (seed) + reconciled `currentBalance` = initialBalance + Σincome − Σexpense (`POST /accounts/:id/reconcile`). **The account-level credit pool** (`creditLimit` + `creditUsedInitial`, seed) is the **shared/master cap across every CREDIT-kind card on the account** — this applies not just to a standalone credit card (a `CREDIT_LINE` account) but to **any cardable account that's grown a CREDIT-kind card** (e.g. a checking account's bank add-on credit card); the contract exposes a **derived `creditUsed` = creditUsedInitial + Σexpense − Σincome** (income = card payments; computed on-read via `sumsByAccount`), `"0"` when the account has no credit pool. List filter `?status=active|inactive`; `POST /accounts/:id/status`. List/get also return a 30d `balanceSeries` + `balanceChangePct` (for sparklines). Deleting unlinks transactions (`onDelete: SetNull`).
  - **card-account** / **card-limit** (specs/004, 007): `CardAccount` (table `card-account`) = the physical **payment instrument** (plastic), **always belongs to a `BankAccount`** (`onDelete: Cascade`) — `kind` (`CardKind`: **CREDIT/DEBIT/PREPAID**), `last4` (**only the last 4 digits ever transmitted/stored — full PAN never leaves the browser; no CVV**), `expiryMonth`/`expiryYear`, `isActive`. **Every CREDIT card must resolve to a determinate limit before it can be saved** (mandatory — `CardsService.resolveCreditLimits`, mirrored in `AccountsService.create`'s inline `cards[]` path): the account's **first** CREDIT card becomes its `isPrimary` card (boolean, `@default(false)`, assigned automatically — never user-toggled, at most one `true` per account) — its limit **IS** the account's own `creditLimit`/`creditUsedInitial`, editable from either side (the account's own edit form, or the primary card's own edit form; same underlying value, no `CardLimit` row for it, `limits` always `[]`). Any **additional** CREDIT card on the same account chooses, via `usesAccountPool` (boolean, default `true`), between sharing that same pool (no `CardLimit` rows) or `false` = its own independent sub-limit — one **`CardLimit`** row per currency (table `card-limit`: `limitAmount` + `usedInitial`, exposes a derived `used` the same way the account does), still capped against the account's pool in the account's own currency (`CARD_SUBLIMIT_EXCEEDS_ACCOUNT`); sub-limits in other currencies aren't cross-checked (no FX conversion in this app). Missing/zero limit where one is required throws `CARD_LIMIT_REQUIRED`. **Only CHECKING/SIGHT/CREDIT_LINE accounts can have cards** (`accounts.CARDABLE_ACCOUNT_TYPES`/`isCardableAccountType` in `@finance/contracts`) — SAVINGS, INVESTMENT and CASH never carry a card of their own (real-world: their funds move via transfer into a cardable account first); enforced in `CardsService.create` and `AccountsService.create`'s inline `cards[]` (error code `ACCOUNT_CANNOT_HAVE_CARD`), and mirrored in the web UI (`CardsAside`'s add button, `TransactionCreateModal`'s card field) — both hide/reject for non-cardable types. Nested endpoints `POST/PATCH/DELETE /accounts/:id/cards[/:cardId]`; `POST /accounts` accepts inline `cards[]`. Display masked as `•••• last4`; `CardsAside` in the account-detail view shows every card as a `AccountVisualCard` tile (gradient keyed by `kind`, matching the create-account draft tiles, plus a small "Principal"/"Adicional" badge on CREDIT cards) — clicking one opens `CardDetailModal` (enlarged, centered) with Editar/Eliminar, instead of always-visible buttons under each tile. `CardForm` is a 3-state UI (non-CREDIT: no limit section; CREDIT-becomes-primary: one mandatory amount field in the account's currency, plus an optional repeatable "topes en otras monedas" section excluding that currency; CREDIT-additional: a "Cupo de la cuenta"/"Tope propio" toggle, the latter revealing the repeatable currency/amount rows). `AccountCreateModal`'s account-level cupo fields become read-only once a CREDIT card is drafted (mirrors that card's own limit); `AccountForm` (editing an existing account) likewise disables its cupo fields once a primary card exists. **The primary card can ALSO carry `CardLimit` rows — only for currencies other than the account's own** (that one stays exclusively on `BankAccount.creditLimit`, never duplicated) — an independent, non-cross-checked pool per extra currency (no FX in this app), same mechanism a non-primary card's own sub-limit already uses. The contract exposes a derived **`BankAccount.creditPools: {currency, limit, used}[]`** (the account's own-currency pool + the primary's extra ones; empty for non-credit accounts) — shown as a list in `AccountDetailRoute` whenever there's more than one, and per-card in `CardDetailModal`. Because a single card can now share the pool in one currency while being independently limited in another, `TransactionsRepository.sumsForAccount`/`AccountsRepository.sumsByAccount` are scoped to the account's own currency and only exclude a card from that sum if its `CardLimit` is in *that same currency* (not "any currency" — a bug this fixed). **`Card.ownUsed`** (derived, moneyString) is a CREDIT card's own Σexpense−Σincome in the account's own currency regardless of whether it shares the pool or has its own `CardLimit` — so a pool-sharing card can display its own individual contribution instead of the fully-combined pool total (which only the no-`card` account-level tile shows); no seed baseline exists per-card the way `creditUsedInitial`/`CardLimit.usedInitial` do, so pre-existing debt not tied to a transaction is invisible here even though it's included in the account's own `creditUsed`. `AccountVisualCard` uses `card.ownUsed` (not `account.creditUsed`) as the "used" half of a pool-sharing card's progress bar. **`BankAccount.billingCycleDay`** (nullable, 1-28): once set, `creditUsed`/`ownUsed`/a card's own `CardLimit.used` are scoped to the CURRENT billing cycle (since the most recent occurrence of this day, via `accounts/billing-cycle.ts`'s `currentCycleStart`) instead of all-time — usage genuinely resets each cycle (transactions aren't deleted, they just stop counting toward the current limit/display once the next cut-off passes); `null` (the default) keeps the old all-time behavior. Applies uniformly to every card sharing the account (one statement covers all of them) — a card has no billing day of its own. **Correctness fix bundled with this feature:** for any account type OTHER than `CREDIT_LINE` (i.e. one that merely grew an add-on credit card), `sumsForAccount`/`sumsByAccount` previously summed *every* transaction on the account (debit-card spend, cash, salary/other income) toward the credit pool — now scoped to only EXPENSE via a pool-sharing CREDIT card, since unrelated account activity has nothing to do with the credit line (this app also has no way to record "a payment toward this specific add-on card" apart from ordinary account income, so income is never subtracted in this case — a documented limitation, not a bug). A standalone `CREDIT_LINE` account is unaffected (unchanged: every transaction on it already is a credit-line one by construction). **`AccountCreateModal`'s creation flow for `CREDIT_LINE` no longer requires a separate "add card" step for the primary**: since a standalone credit-line account has no real bank account behind it, its generic "Número de cuenta" field is replaced by "Últimos 4 dígitos" + "Vencimiento" (the same `last4`/`expiryMonth`/`expiryYear` a card needs) — combined with the account's own already-shown `creditLimit`/`creditUsedInitial`, the modal constructs the primary `CreateCard` entry itself (`kind: "CREDIT"`, `usesAccountPool: true`, `limits: [{currency, limitAmount: creditLimit}]`) and puts it first in the submitted `cards[]`, so the backend's existing "first CREDIT card becomes primary" resolution picks it up with no schema/API change needed. The modal's "Tarjetas" section (renamed "Tarjetas adicionales" for this type) is therefore always additional-only for `CREDIT_LINE` — `CardForm`'s `hasExistingPrimary` is forced `true` regardless of what's drafted there. Unaffected: editing an existing account (`AccountForm`) and any OTHER account type growing an add-on card still go through the normal `CardsAside` → "Añadir tarjeta" flow.
    Amendment (persisted `creditUsed` + "pagar facturación", 2026-07-25): `BankAccount.creditUsed` is
    now a **persisted column**, not derived on read — seeded from `creditUsedInitial` at creation,
    then incremented/decremented directly by `TransactionsService` on transaction create/update/delete
    (see below) and decremented by paying a statement. **`BankAccount.billingCycleDay` no longer
    scopes any sum to a time window** — it's purely informational now (no automatic reset); the old
    "usage resets each cycle" behavior is gone, replaced by an explicit **`POST /accounts/:id/pay-credit`**
    (requires `creditUsed > 0`) that logs a **`CreditStatement`** row (table `credit-statement`:
    `accountId`, `amount`, `paidAt`) and resets `creditUsed` to `0` — history via
    `GET /accounts/:id/credit-statements`. New `BankAccount.paymentMethod`
    (`BillingPaymentMethod`: MANUAL default/AUTOMATIC) is a stored preference only — `AUTOMATIC` has
    no functional effect yet (see `docs/PENDING.md`). **`CardLimit.used` (a card's own independent
    sub-limit) is unchanged** — still derived from transactions the old way; this persistence model
    covers only the account-level shared pool (v1 scope). `AccountCreateModal` no longer asks for
    `status`, `billingCycleDay`, or `paymentMethod` at creation — every new account starts
    `ACTIVE`/unconfigured/`MANUAL` and these are only editable afterward via `AccountForm` or the
    existing status toggle button in `AccountDetailRoute`; a warning badge (click opens a dedicated
    `BillingSettingsModal`, not the full edit form) shows next to the account name while a
    credit-pool account has no billing day configured.
    Amendment (`BillingSettings` split + locked `AUTOMATIC`, 2026-07-25): `billingCycleDay`/
    `paymentMethod`/`paymentDueDay` moved off `BankAccount` into their own **`BillingSettings`**
    model (table `billing-settings`, 1:1 via `accountId` unique FK, `onDelete: Cascade`) — kept
    separate so this config can be reviewed/maintained independently instead of growing the
    accounts table. `AccountsRepository.upsertBillingSettings` creates-or-updates it;
    `AccountsService.create`/`update` call it after the base account write; `withCards` includes
    `billingSettings` on every read. The API contract shape is unchanged (`BankAccount.billingCycleDay`/
    `paymentMethod` still flat fields — the join is internal). `TransactionsRepository.findAccount`
    and `CardsRepository.accountExists` now select `billingSettings.billingCycleDay` instead of a
    scalar column. **New `BillingSettings.paymentDueDay`** (nullable Int) is a reserved-but-unused
    column — the "AUTOMATIC" payment method option is **locked in the UI** (`shared/ui/segmented.tsx`
    gained per-option `disabled`/`disabledReason`, rendered as a genuinely native-`disabled` button —
    no click handler fires at all, just a title tooltip explaining why; used in both `AccountForm`
    and the new `BillingSettingsModal`) until the payment-due-date format is actually decided (see
    `docs/PENDING.md`).
    Amendment (billing periods + automatic generation + real payments, 2026-07-25): the old
    one-shot `POST /accounts/:id/pay-credit` (which just zeroed `creditUsed`) is replaced by a
    full billing-period model. **`Transaction.creditStatementId`** links a contributing movement,
    at creation time, to whichever `CreditStatement` is currently OPEN for the account
    (`TransactionsRepository.findOrCreateOpenStatement`) — never reassigned by date on edit.
    `CreditStatement` has no stored `status`; it's derived from `closedAt`/`paidAt`: **OPEN**
    (`closedAt` null, still accumulating — `amount` is computed LIVE as the sum of its linked
    transactions, so edits/deletes/additions update it with no manual correction needed) →
    **PENDING** (`closedAt` set by generation, awaiting payment, amount still live) → **PAID**
    (`paidAt` set, `amount` frozen at pay time — only now correctable via `PATCH
    /accounts/:id/credit-statements/:id`, `{amount}`, no cascade to the linked payment transaction
    or to `creditUsed`, same deliberate no-cascade spirit as before). Once a transaction's
    statement is PAID, editing/deleting it never touches `creditUsed` again (already settled).
    **`BillingGenerationService`** (`domains/accounts/billing-generation.service.ts` — retired by
    the DDD + CQRS amendment below; this logic is now
    `application/commands/generate-statements.handler.ts` + the `BillingEligibilityStrategy`
    implementations in `domain/`) closes the
    OPEN statement once `BillingSettings.billingCycleDay` passes, gated on eligibility (account +
    relevant credit card both `ACTIVE`) and on there being anything to close (no usage → no
    statement was ever opened → nothing happens) — shared by a **daily cron**
    (new **`src/infra/cron/`** module — `cron.module.ts` + `billing-generation.cron.ts`, using the
    new **`@nestjs/schedule`** dependency, `EVERY_DAY_AT_3AM`, iterates every user's due accounts)
    and the **manual "Generar facturación" button** (`POST /accounts/:id/generate-statements`).
    **Paying** (`POST /accounts/:id/credit-statements/:id/pay`, `{fromAccountId}`, any account type
    except `CREDIT_LINE`) atomically creates a real EXPENSE `Transaction` on that account (visible
    in its own Movimientos like any other expense), decrements the credit account's `creditUsed`
    by the statement's amount (not a full reset — purchases after the period closed land in the
    next OPEN period and still count, so a remainder can remain after paying), and freezes the
    statement as PAID (`AccountsRepository.payStatement`, one Prisma interactive transaction).
    Web: `AccountDetailRoute` gained a **Movimientos/Facturación** tab switcher
    (`shared/ui/tabs.tsx`) — the old sidebar `CreditPaySection` is gone, replaced by
    `domains/accounts/components/BillingSection.tsx` (table of periods/amounts/status/actions,
    pay-from-account modal, correct-paid-amount modal, generate button).
    Amendment (backend DDD + CQRS migration, 2026-07-25, specs/009-ddd-cqrs-architecture):
    **`apps/api`'s `accounts` domain is the reference implementation for a repo-wide migration off
    the flat `module/controller/service/repository` skeleton onto full tactical DDD + CQRS** —
    **all 11 domains are now migrated**; no `*.service.ts`/`*.repository.ts` file remains under
    `src/domains/`, so mirror `accounts` for anything new. The old `accounts.service.ts`/
    `accounts.repository.ts`/`cards.service.ts`/`cards.repository.ts`/
    `billing-generation.service.ts` are **retired** — every business rule/behavior described above
    is unchanged, only where the code enforcing it lives. New structure under
    `apps/api/src/domains/accounts/`: **`domain/`** (`BankAccount` aggregate — cardable/account-number/
    credit-limit invariants; `CreditStatement` aggregate with a **State** pattern for its
    OPEN→PENDING→PAID lifecycle, one class per stage in `domain/states/`; `BillingEligibilityStrategy`
    — a **Strategy** per account shape, `CreditLineEligibility`/`AddOnCardEligibility`; domain events
    `StatementClosedEvent`/`StatementPaidEvent`/`AccountDeactivatedEvent`; repository **ports**
    `BankAccountRepositoryPort`/`CreditStatementRepositoryPort`; `domain/errors.ts`), **`application/`**
    (one command + handler pair per mutation — `pay-credit-statement`, `generate-statements` +
    `GenerateAllDueStatementsCommand` for the cron [`scope: "system"`, the one named/typed exception
    to per-user command scoping], `correct-statement-amount`, plus create/update/reconcile/remove
    account and add/update/remove card; one query + handler pair per read —
    `list-accounts`/`get-account`/`list-credit-statements`; `LogStatementPaidListener` is the
    reference **Observer** subscriber, proving a new reaction attaches with zero changes to the
    publishing code), **`infrastructure/`** (`PrismaBankAccountRepository`/
    `PrismaCreditStatementRepository` — the ONLY files in this domain allowed to import
    `@prisma/client`, implementing the domain's ports — **Adapter** pattern), **`presentation/`**
    (`accounts.controller.ts` rewritten as a thin **Facade**: translates each request into a
    command/query via `CommandBus`/`QueryBus`, using the new `ZodParamsPipe` — mirrors
    `ZodValidationPipe` but for path params, e.g. `:id` — for every route param). Every
    `*CommandHandler`/`*QueryHandler` extends a shared **Template Method** base class
    (`BaseCommandHandler`/`BaseQueryHandler`, `apps/api/src/infra/cqrs/`, built on `@nestjs/cqrs`'s
    `CommandBus`/`QueryBus`/`EventBus`) fixing a load → handle → persist → publish skeleton.
    Cross-cutting logging/timing is the **Decorator**: `infra/cqrs/handler-logging.interceptor.ts`,
    registered once as a global `APP_INTERCEPTOR` in `app.module.ts` (never a `Logger` call inside a
    handler, never a hand-wrapped `CommandBus.execute`).
    **Cross-aggregate persistence** (paying a statement touches `CreditStatement` + a new
    `Transaction` + `BankAccount` in one atomic step): `PayCreditStatementHandler` overrides
    `persist()` to wrap all three saves in one `prisma.$transaction(...)` — a documented pragmatic
    exception to one-aggregate-per-transaction purity, not a violation of it. Domain events dispatch
    **synchronously by default** (a failing listener surfaces in the same request). Tests moved out of
    `src/` into `apps/api/test/{unit,integration,e2e}/`, mirroring `src/domains/accounts/<layer>/` —
    `apps/api/test/setup-env.ts` (Vitest `setupFiles`) loads `apps/api/.env` so suites that build
    `PrismaService` from a bare `new ConfigService()` find `DATABASE_URL` (`TEST_DATABASE_URL`
    overrides it when set); `test:unit` runs with **zero** database connections (aggregates/states/strategies/handlers all use
    fake ports); `test:integration` exercises the Prisma adapters + the pay-statement transaction's
    rollback guarantee against a real test DB; `test:e2e` drives the full HTTP flow through the
    Facade controller. **No public API/contract change** — `@finance/contracts`'s `accounts` shapes
    are untouched; this is a pure internal reorganization. Full pattern + rationale:
    `docs/{english,spanish}/ARCHITECTURE.md` §12a; spec/plan/tasks: `specs/009-ddd-cqrs-architecture/`.
    Amendment (one table = one domain, 2026-07-30): the 11 business domains were **split by table**
    — every table in `schema.prisma` now has its own folder `src/domains/<table>/` and **exactly one
    adapter may query it**. The former `accounts` folder became `bank-account` + `card-account` +
    `card-limit` + `billing-settings` + `credit-statement`; `transactions` → `transaction`;
    `savings` → `savings-goal` + `savings-entry`; `installments` → `installment-plan` +
    `installment-payment`; `reference` → `country` + `currency` + `country-currency` +
    `country-identifier-type` + `financial-institution`; `auth` → `user`; `wallet` →
    `wallet-item-dashboard`; `debts`/`recurring`/`investments` → singular; `etf-price-cache` gained a
    folder even though its feature is deferred. `import` and `health` are the only table-less folders
    (`import` writes movements via the `transaction` domain's writer port). **Aggregate boundaries are
    unchanged**: `CardAccount`/`CardLimit`/`BillingSettings` are still entities of the `BankAccount`
    aggregate and are only written through it (their per-table domains own the table, never the
    rules) — same for `InstallmentPayment` under `InstallmentPlan` and `SavingsEntry` under
    `SavingsGoal`. Two consequences to respect when adding code: (1) a Prisma `include` across tables
    is replaced by **composing the other table's port** (`PrismaBankAccountRepository` injects the
    card/limit/billing/institution ports; `PrismaTransactionRepository` moves the credit pool via
    `BankAccountRepositoryPort.incrementCreditUsedWithTx`) — cross-table atomicity still comes from a
    single `prisma.$transaction(...)` whose participants each expose a `*WithTx` method; (2) each
    table has a **`<table>.data.module.ts` leaf** (exports only its port→adapter binding, imports no
    other domain) plus an optional **`<table>.module.ts`** with handlers/controllers that imports the
    leaves it reads — orchestration depends on leaves, never the reverse, which is what keeps the
    graph acyclic where two tables reference each other (`transaction` ⇄ `bank-account`,
    `credit-statement` ⇄ `bank-account`). Public URLs are unchanged: `/accounts/:id/credit-statements*`
    and `/generate-statements` moved to `credit-statement`'s own Facade, `/countries`,
    `/institutions` and `/currencies` to theirs. No contract change. Shared test helpers:
    `test/unit/support/fake-ports.ts` (fake port per table + an `accountAggregate` builder) and
    `test/integration/support/repositories.ts` (composes the real adapter graphs).
  - **transaction** (specs/005, 007; folder `domains/transaction`): income/expense linked to a `BankAccount` and (optionally) a `Card`. Rules in `transaction/domain/movement-policy.ts` + its command handlers (contract requires `bankAccountId` on create + refine `INCOME ⇒ no card`): INCOME → no card; EXPENSE on CASH → no card; EXPENSE on **CREDIT_LINE → card required** (must belong); EXPENSE on other non-cash accounts → card optional. **Whenever the card used is CREDIT-kind** (on a CREDIT_LINE account, or any other account that's grown one), the amount is checked against **both** the account's shared pool (persisted `creditUsed` + amount ≤ `creditLimit`, error `CARD_LIMIT_EXCEEDED`) **and**, if the card has its own `CardLimit` for that currency, that narrower (still derived) sub-limit too (`sumsForCard`, error `CARD_SUBLIMIT_EXCEEDED`). Creating/editing/deleting a transaction that draws on the shared pool mutates `BankAccount.creditUsed` directly (`BankAccountRepositoryPort.incrementCreditUsedWithTx`, called inside the movement's own `$transaction`) — edits/deletes revert the transaction's old contribution before applying the new one, including when the transaction moves to a different account (see accounts' billing-period amendment above for the linked-transaction/paid-statement exception). Full CRUD from both the Movements view and the Account view (shared `TransactionTable` with edit/delete, plus a `TransactionDetailModal` read-only view opened by clicking a row). Filter query supports `bankAccountId` + `cardId` (bank→card). Error codes: `CARD_REQUIRED`, `CARD_NOT_ALLOWED`, `CARD_ACCOUNT_MISMATCH`, `CARD_LIMIT_EXCEEDED`, `CARD_SUBLIMIT_EXCEEDED`.
  - **recurring-expense**: `RecurringExpense` (subscriptions/rent/periodic payments) — `frequency` (`RecurrenceFrequency`: WEEKLY/MONTHLY/YEARLY), `interval`, `anchorDate`, optional `bankAccountId`/`category`, `active`. The contract exposes a computed `nextDueAt` (anchor stepped forward by frequency × interval). CRUD at `/recurring`.
  - **reference tables** (`country`, `currency`, `country-currency`, `country-identifier-type`, `financial-institution` — one domain each since the one-table-one-domain amendment; global read-only, authed but not user-scoped): `Country` (table `country`, ISO 3166-1 `alpha2`/`alpha3`/`numeric` unique + name), `FinancialInstitution` (table `financial-institution`, **banks + non-bank card issuers** via `kind` `InstitutionKind` BANK/NON_BANK_ISSUER; `code` = SBIF/CMF or código institucional `@@unique([countryId,code])`, `name`, `rut?` (Chilean issuers), `category` `BankCategory?` ESTABLISHED/FOREIGN_BRANCH/STATE (banks only), `brands String[]`, `notes`, FK→Country), `Currency` (table `currency`, **ISO 4217** `code` unique + `numeric` + name), and `CountryCurrency` join (`isPrimary`). Endpoints `GET /countries`, `GET /institutions?country=CL&kind=BANK`, `GET /currencies` (ordered by name). Seeded idempotently in `prisma/seed.ts` (`seedReferenceData`): 6 countries, 18 CL banks + 15 non-bank issuers, 168 currencies, country↔currency links. **`BankAccount.institutionId`** FK → `FinancialInstitution` (the "institution" selector; scalar `institution` text mirrors its name for display; relation field is `financialInstitution`); web forms use `useInstitutions`/`useCurrencies` selects (`apps/web`'s `domains/reference` — the FRONTEND keeps one reference module; only the backend is split per table).
  - **wallet-item-dashboard**: `WalletItemDashboard` (table `wallet-item-dashboard`) `(accountId? | cardId?, order)` — a user-curated set of pinned cards **or** accounts for the dashboard "wallet" (exactly one of card/account; XOR enforced in its aggregate; `onDelete: Cascade`). Endpoints `GET/POST /wallet`, `PATCH /wallet/reorder` (`{ids[]}`), `DELETE /wallet/:id`.
- **`apps/web`** — **Vite + React 19 SPA**, consumes the API over HTTP only (`shared/lib/apiClient.ts`, `VITE_API_URL`). Domain-first: `src/domains/<domain>/{api,hooks,components,routes}`. Routing react-router, data via TanStack Query, **owns the es/en i18n catalogs** (`src/i18n`). **Styling: Tailwind CSS** (design tokens as CSS variables in `src/styles/index.css`, dark-mode ready) with shadcn-style primitives in `src/shared/ui` (`button`, `input`, `label`, `field`, `select`, `searchable-select` [button + portaled, fixed-height (`max-h-60`) custom-scrollbar (`scrollbar-thin`) panel with an in-panel search box — for long option lists a native `<select>` can't restyle/height-cap, e.g. institutions (~20 banks) or currencies (168 ISO codes); `displayValue` prop lets the closed control show something narrower than the list label, e.g. a currency's bare ISO code while the open list reads "Name (CODE)"], `combobox` [free-text input + the same portaled dropdown pattern, for fields that accept a value not in the list, e.g. transaction category], `card`, `badge`, `table`, `page-header`, `states`, `theme-toggle`, `switch`, `dialog` [Radix], `confirm-dialog` [Radix, optional `children` slot for extra confirmation fields], `tabs`, `segmented`, `sparkline`) + `cn` helper (`shared/lib/cn.ts`); authed routes wrapped by `app/AppLayout.tsx`. The **Panel** (`app/DashboardPage.tsx` + `domains/dashboard`) is a frontend-only aggregation (net worth, month flow, category donut, upcoming payments, wallet). Libraries: **Recharts** (charts), **sonner** (toasts; `<Toaster/>` in `app/providers`), **@dnd-kit** (wallet drag-reorder). No DB access, never imports backend internals.
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
  Amendment (dark-theme repaint from design handoff, 2026-07-17): `--background`/`--card`/`--border`/`--input`/`--muted`/`--muted-foreground`/`--primary-foreground`/`--destructive` were replaced with the exact hex from the handoff palette (`#0b1518`/`#0f1e21`/`#1e2e32`/`#283c41`/`#22343a`/`#8aa0a2`/`#08181b`/`#e08a8a` respectively); `--brand`/`--accent`/`--success` already matched and only got sub-degree hue rounding fixes. `--destructive-foreground` (dark) changed from white to a dark ink (`0 45% 10%`) because the handoff's danger red is light enough that white text on a *solid* `bg-destructive` button would fail contrast — mirrors how `--primary`/`--accent` already pair a light base color with a dark "ink" foreground; the ~40 `text-destructive`/low-opacity-fill usages elsewhere were unaffected. New tokens from the same handoff, defined in both themes but **not yet consumed by any component** (available for future use — grep before assuming something already uses them): `--surface-2`/`--chip`/`--track`/`--border-2`/`--text-dim` (dark-named concepts; dark values are the handoff hex, light theme falls back to existing near-equivalents) and `--panel-bg`/`--viewer-bg` (light-named concepts from the handoff; dark theme falls back to `--surface-2`/`--card`). Exposed via Tailwind as `surface2`/`chip`/`track`/`border2`/`dim`/`panel`/`viewer`. Explicit hover hex (`primary-hover`/`accent-hover`) from the light-theme handoff were **not** wired in — `Button` still uses the `hover:bg-primary/90` opacity approach.
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

Active plan: specs/009-ddd-cqrs-architecture/plan.md
(Backend DDD + CQRS migration. apps/api pasa de domain-first plano a 4 capas por dominio
(domain/application/infrastructure/presentation) en los 11 dominios existentes, uno a la vez,
`accounts`/billing primero como referencia. `@nestjs/cqrs` para Command/Query/EventBus (eventos
síncronos por defecto). Aggregates protegen invariantes (State pattern en CreditStatement:
Open/Pending/Paid), Strategy para elegibilidad variable, Template Method para el esqueleto de
handlers, Adapter para repositorios (Prisma detrás de puertos del dominio), Facade en
controladores, Decorator vía interceptors de Nest para cross-cutting concerns. Zod ahora también
valida path params. Tests se mueven de src/ a apps/api/test/{unit,integration,e2e} espejando
src/. Sin cambios de contrato de API pública. Aplicación uniforme en los 11 dominios sin
excepciones (datos bancarios personales). Ver docs/{english,spanish}/ARCHITECTURE.md para el
patrón completo una vez documentado.
**Estado: 009 cerrado** (T001-T058 completos, incluido el Decorator/interceptor global y el gate de
tests). Encima se aplicó, sin spec propia, la regla **una tabla = un dominio**: los 11 dominios se
dividieron en 21 dominios-tabla (+ `import`/`health` sin tabla), un solo adapter por tabla,
constitución en v1.23.0. Ver ARCHITECTURE.md §12a.)
Prior plans: 008 (user profile), 007 (accounts/movements redesign), 006 (deudas/installments view), 005 (transactions redesign), 004 (account cards modal), 003 (accounts mgmt), 002 (design system), 001 (monorepo).

<!-- SPECKIT END -->

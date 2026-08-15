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
- CI (`.github/workflows/ci.yml`) also gates on `pnpm format:check`, `turbo run lint` and **`pnpm audit --audit-level=high`** — advisories are fixed with `pnpm.overrides` in the root `package.json` (today: `postcss`, `brace-expansion`, `fast-uri`, `find-my-way`) or, when a finding genuinely doesn't apply to this app, added to `pnpm.auditConfig.ignoreGhsas` with a reason. CI runs a **`postgres:16-alpine` service** so `test:integration`/`test:e2e` hit a real DB (`prisma db push` before the tests); `DATABASE_URL` is declared in `turbo.json`'s `test` task `env` because Turborepo hides undeclared env vars from tasks
- `pnpm db:migrate` / `pnpm db:seed` — Prisma migrate/seed in `apps/api` (the sole DB owner)
- `pnpm db:push` — sync schema to the DB without migrations (this repo has **no `prisma/migrations` folder**; `db push` is the workflow)
- `pnpm db:reset` — **Docker-based full reset** (`scripts/db-reset.mjs`): tears down the Postgres container + volume (`docker-compose.yml`), recreates it, `db push`, then seeds. Wipes all data (dev only). Requires Docker.

Setup: `apps/api/.env` (`DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, optional `ALPHA_VANTAGE_API_KEY`, and the optional S3 block for movement attachments — `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`; absent, attachments answer `503 ATTACHMENTS_UNAVAILABLE` and nothing else is affected); `apps/web/.env` (`VITE_API_URL`). See each app's `.env.example`. After install, generate the Prisma client: `pnpm --filter @finance/api exec prisma generate`.

## Architecture (big picture)

**pnpm + Turborepo monorepo** with two separately-deployable apps + shared packages. TypeScript, Node 20. Migrated from the legacy single Next.js app via specs/001.

- **`apps/api`** — **NestJS 11** (Express 5), the **sole owner of the database** (Prisma 7 / PostgreSQL, connected via the `@prisma/adapter-pg` driver adapter — Prisma 7 no longer accepts a `datasource.url` in `schema.prisma`; the connection string lives in `apps/api/prisma.config.ts` (CLI) and is passed to `PrismaService`'s constructor via `ConfigService` (app runtime); `prisma/seed.ts` builds its own adapter the same way). **Table-first: one DB table = one folder under `src/domains/<table>/`** (kebab-case, matching the table's `@@map`), each split into the four DDD layers `domain/`, `application/`, `infrastructure/`, `presentation/` (specs/009 + the one-table-one-domain amendment below; the old flat `*.service.ts`/`*.repository.ts` skeleton is gone, and tests live in `apps/api/test/{unit,integration,e2e}/` mirroring `src/`). The 23 table-domains: bank-account, billing-settings, credit-statement, card-account, card-limit, transaction, wallet-item-dashboard, installment-plan, installment-payment, debt, savings-goal, savings-entry, recurring-expense, investment, etf-price-cache, user, country, currency, country-currency, country-identifier-type, financial-institution, institution-account-type, transaction-attachment — plus `import` and `health`, the only folders that own no table. Cross-cutting in `src/infra/` (`prisma` single client, `auth` `JwtAuthGuard` + `@CurrentUser`, `http` error filter + `ZodValidationPipe`, `config`, `cron` scheduled automations via `@nestjs/schedule` — each `*.cron.ts` is a thin trigger dispatching a `scope: "system"` command into its domain, e.g. `billing-generation.cron.ts` → `credit-statement`'s `GenerateAllDueStatementsCommand`). Global prefix `/api/v1`. **DB table names are kebab-case via `@@map`** (e.g. `bank-account`, `card-account`, `wallet-item-dashboard`); Prisma model names stay PascalCase. Auth is **pure JWT email+password** — the NextAuth `Account`/`Session`/`VerificationToken` tables were removed (no OAuth adapter in the API).
  - **bank-account** (specs/003, 007; the aggregate root of the accounts cluster — `card-account`/`card-limit`/`billing-settings`/`credit-statement` are its own table-domains, written only through it): `BankAccount` is **where money or a credit line lives**. `type` (`AccountType`: **CHECKING/SIGHT/SAVINGS/INVESTMENT/CREDIT_LINE/CASH**), `status` (ACTIVE/INACTIVE), `accountNumber` (**bank account number — free text, stored/shown in full; NOT a card PAN**; **required for CHECKING/SIGHT/SAVINGS**, optional for CREDIT_LINE/INVESTMENT/CASH — enforced via a zod refine on create and by the aggregate on update, `ACCOUNT_NUMBER_REQUIRED`), `initialBalance` (seed) + `currentBalance`, which every movement keeps in step (`initialBalance` + Σincome − Σexpense): creating/editing/deleting a transaction applies its signed balance delta inside the movement's own `$transaction` (`transaction/domain/balance-delta.ts` → `BankAccountRepositoryPort.incrementBalanceWithTx`), exactly as it already does for `creditUsed`. **The manual `POST /accounts/:id/reconcile` is gone** (command, handler, aggregate method and UI button removed) — a balance that maintains itself has nothing to reconcile. **The account-level credit pool** (`creditLimit` + `creditUsedInitial`, seed) is the **shared/master cap across every CREDIT-kind card on the account** — this applies not just to a standalone credit card (a `CREDIT_LINE` account) but to **any cardable account that's grown a CREDIT-kind card** (e.g. a checking account's bank add-on credit card); the contract exposes a **derived `creditUsed` = creditUsedInitial + Σexpense − Σincome** (income = card payments; computed on-read via `sumsByAccount`), `"0"` when the account has no credit pool. List filter `?status=active|inactive`; `POST /accounts/:id/status`. List/get also return a 30d `balanceSeries` + `balanceChangePct` (for sparklines). Deleting unlinks transactions (`onDelete: SetNull`).
  - **card-account** / **card-limit** (specs/004, 007): `CardAccount` (table `card-account`) = the physical **payment instrument** (plastic), **always belongs to a `BankAccount`** (`onDelete: Cascade`) — `kind` (`CardKind`: **CREDIT/DEBIT/PREPAID**), `last4` (**only the last 4 digits ever transmitted/stored — full PAN never leaves the browser; no CVV**), `expiryMonth`/`expiryYear`, `isActive`. **Every CREDIT card must resolve to a determinate limit before it can be saved** (mandatory — `CardsService.resolveCreditLimits`, mirrored in `AccountsService.create`'s inline `cards[]` path): the account's **first** CREDIT card becomes its `isPrimary` card (boolean, `@default(false)`, assigned automatically — never user-toggled, at most one `true` per account) — its limit **IS** the account's own `creditLimit`/`creditUsedInitial`, editable from either side (the account's own edit form, or the primary card's own edit form; same underlying value, no `CardLimit` row for it, `limits` always `[]`). Any **additional** CREDIT card on the same account chooses, via `usesAccountPool` (boolean, default `true`), between sharing that same pool (no `CardLimit` rows) or `false` = its own independent sub-limit — one **`CardLimit`** row per currency (table `card-limit`: `limitAmount` + `usedInitial`, exposes a derived `used` the same way the account does), still capped against the account's pool in the account's own currency (`CARD_SUBLIMIT_EXCEEDS_ACCOUNT`); sub-limits in other currencies aren't cross-checked (no FX conversion in this app). Missing/zero limit where one is required throws `CARD_LIMIT_REQUIRED`. **Only CHECKING/SIGHT/CREDIT_LINE accounts can have cards** (`accounts.CARDABLE_ACCOUNT_TYPES`/`isCardableAccountType` in `@finance/contracts`) — SAVINGS, INVESTMENT and CASH never carry a card of their own (real-world: their funds move via transfer into a cardable account first); enforced in `CardsService.create` and `AccountsService.create`'s inline `cards[]` (error code `ACCOUNT_CANNOT_HAVE_CARD`), and mirrored in the web UI (`CardsAside`'s add button, `TransactionCreateModal`'s card field) — both hide/reject for non-cardable types. Nested endpoints `POST/PATCH/DELETE /accounts/:id/cards[/:cardId]`; `POST /accounts` accepts inline `cards[]`. Display masked as `•••• last4`; `CardsAside` in the account-detail view shows every card as a `AccountVisualCard` tile (gradient keyed by `kind`, matching the create-account draft tiles, plus a small "Principal"/"Adicional" badge on CREDIT cards) — clicking one opens `CardDetailModal` (enlarged, centered) with Editar/Eliminar, instead of always-visible buttons under each tile. `CardForm` is a 3-state UI (non-CREDIT: no limit section; CREDIT-becomes-primary: one mandatory amount field in the account's currency, plus an optional repeatable "topes en otras monedas" section excluding that currency; CREDIT-additional: a "Cupo de la cuenta"/"Tope propio" toggle, the latter revealing the repeatable currency/amount rows). `AccountCreateModal`'s account-level cupo fields become read-only once a CREDIT card is drafted (mirrors that card's own limit); `AccountForm` (editing an existing account) likewise disables its cupo fields once a primary card exists. **The primary card can ALSO carry `CardLimit` rows — only for currencies other than the account's own** (that one stays exclusively on `BankAccount.creditLimit`, never duplicated) — an independent, non-cross-checked pool per extra currency (no FX in this app), same mechanism a non-primary card's own sub-limit already uses. The contract exposes a derived **`BankAccount.creditPools: {currency, limit, used}[]`** (the account's own-currency pool + the primary's extra ones; empty for non-credit accounts) — shown as a list in `AccountDetailRoute` whenever there's more than one, and per-card in `CardDetailModal`. Because a single card can now share the pool in one currency while being independently limited in another, `TransactionsRepository.sumsForAccount`/`AccountsRepository.sumsByAccount` are scoped to the account's own currency and only exclude a card from that sum if its `CardLimit` is in _that same currency_ (not "any currency" — a bug this fixed). **`Card.ownUsed`** (derived, moneyString) is a CREDIT card's own Σexpense−Σincome in the account's own currency regardless of whether it shares the pool or has its own `CardLimit` — so a pool-sharing card can display its own individual contribution instead of the fully-combined pool total (which only the no-`card` account-level tile shows); no seed baseline exists per-card the way `creditUsedInitial`/`CardLimit.usedInitial` do, so pre-existing debt not tied to a transaction is invisible here even though it's included in the account's own `creditUsed`. `AccountVisualCard` uses `card.ownUsed` (not `account.creditUsed`) as the "used" half of a pool-sharing card's progress bar. **`BankAccount.billingCycleDay`** (nullable, 1-28): once set, `creditUsed`/`ownUsed`/a card's own `CardLimit.used` are scoped to the CURRENT billing cycle (since the most recent occurrence of this day, via `accounts/billing-cycle.ts`'s `currentCycleStart`) instead of all-time — usage genuinely resets each cycle (transactions aren't deleted, they just stop counting toward the current limit/display once the next cut-off passes); `null` (the default) keeps the old all-time behavior. Applies uniformly to every card sharing the account (one statement covers all of them) — a card has no billing day of its own. **Correctness fix bundled with this feature:** for any account type OTHER than `CREDIT_LINE` (i.e. one that merely grew an add-on credit card), `sumsForAccount`/`sumsByAccount` previously summed _every_ transaction on the account (debit-card spend, cash, salary/other income) toward the credit pool — now scoped to only EXPENSE via a pool-sharing CREDIT card, since unrelated account activity has nothing to do with the credit line (this app also has no way to record "a payment toward this specific add-on card" apart from ordinary account income, so income is never subtracted in this case — a documented limitation, not a bug). A standalone `CREDIT_LINE` account is unaffected (unchanged: every transaction on it already is a credit-line one by construction). **`AccountCreateModal`'s creation flow for `CREDIT_LINE` no longer requires a separate "add card" step for the primary**: since a standalone credit-line account has no real bank account behind it, its generic "Número de cuenta" field is replaced by "Últimos 4 dígitos" + "Vencimiento" (the same `last4`/`expiryMonth`/`expiryYear` a card needs) — combined with the account's own already-shown `creditLimit`/`creditUsedInitial`, the modal constructs the primary `CreateCard` entry itself (`kind: "CREDIT"`, `usesAccountPool: true`, `limits: [{currency, limitAmount: creditLimit}]`) and puts it first in the submitted `cards[]`, so the backend's existing "first CREDIT card becomes primary" resolution picks it up with no schema/API change needed. The modal's "Tarjetas" section (renamed "Tarjetas adicionales" for this type) is therefore always additional-only for `CREDIT_LINE` — `CardForm`'s `hasExistingPrimary` is forced `true` regardless of what's drafted there. Unaffected: editing an existing account (`AccountForm`) and any OTHER account type growing an add-on card still go through the normal `CardsAside` → "Añadir tarjeta" flow.
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
    Amendment (partial payments + minimum payment + payment date/reference, 2026-08-07):
    a period can now be settled in SEVERAL payments. **`CreditStatement.paidAmount`** (new column)
    accumulates what has been settled; the derived status gains **`PARTIALLY_PAID`**
    (`domain/states/partially-paid-state.ts`) between PENDING and PAID, and `amount` freezes only
    once the period is fully settled — while partially paid it is still the LIVE sum of its linked
    transactions, so a partially paid period refuses `correctAmount` exactly as PENDING does.
    `CreditStatement.pay` became **`payTowards(periodAmount, amount, …)`**: the period's total is
    passed IN (it isn't stored until settled), the payment must be positive and must not exceed
    `remainingFor(periodAmount)` — an overpayment throws **`PAYMENT_EXCEEDS_REMAINING`** rather than
    being capped, and a non-positive one throws `INVALID_PAYMENT_AMOUNT`. `creditUsed` is decremented
    by the amount ACTUALLY paid, not by the period's total. `POST /accounts/:id/credit-statements/:id/pay`
    accepts optional `amount` (omitted = settle everything owed), `paidAt` (dates the created EXPENSE)
    and `reference` (carried onto that movement's `observation`). **`BillingSettings.minimumPaymentPercent`**
    (new column, nullable Decimal) is the per-account minimum-payment rule — there is no universal
    one, so an account without it configured simply HAS no minimum and the UI offers no such option;
    exposed as `BankAccount.minimumPaymentPercent` and editable from `AccountForm` and
    `BillingSettingsModal`. The contract's `CreditStatement` now also carries `paidAmount`,
    `remainingAmount`, `minimumAmount` and a derived **`breakdown`** (`purchases` vs `installments` +
    `installmentCount`), computed from the period's own linked transactions via the new
    `TransactionSumsRepositoryPort.breakdownForStatement` — never stored, and deliberately WITHOUT an
    "interest" figure, which the model has no concept of. All three statement DTOs are built by one
    shared `application/statement-dto.mapper.ts` so remaining/minimum can't drift between the list
    query and the pay/correct commands. Web: the old centered pay modal became
    **`PayStatementPanel`** (a `SidePanel`, like the card/account panels) with a Total/Mínimo/Otro
    monto segmented control, the period breakdown, the source account's balance before and after,
    what would remain owed, plus payment date and reference.
    Amendment (a partial payment settles the period; the shortfall is carried forward, 2026-08-12):
    the multi-payment model above is **superseded**. **Any** payment — the total, the account's
    minimum, or any figure between — now SETTLES the period: `paidAt` is stamped and `amount` freezes
    at the period's real total (not at what was paid). What the payment didn't cover is rolled into
    the next period as the new column **`CreditStatement.carriedOverAmount`**, and the settled period
    records where it went in **`carriedToId`**. A period therefore never stays half-payable and the
    derived status is back to OPEN → PENDING → PAID — **`PARTIALLY_PAID` and `PartiallyPaidState` are
    gone** (contract enum, badges and the "Pagado hasta ahora" row too). A period's total owed is
    `CreditStatement.totalFor(linkedSum)` = its linked transactions **plus** `carriedOverAmount` — the
    carry-over is a figure of its own, deliberately NOT a synthetic "saldo anterior" movement, which
    "Sincronizar pagos" (recomputing from real movements) would erase. `PayCreditStatementHandler`
    resolves the receiving period inside the same `$transaction`
    (`findOrCreateCarryOverTargetWithTx` — the account's OPEN period excluding the one being paid,
    or a fresh one starting at its `closedAt` — then `addCarriedOverWithTx`). Unchanged: `creditUsed`
    drops only by what was ACTUALLY paid (the shortfall is still used credit, now owed in the next
    period) and an overpayment still throws `PAYMENT_EXCEEDS_REMAINING`. `syncAmount` gained a third
    case: a period settled with a shortfall keeps its payment and pool untouched and instead returns
    a **`carryOverDelta`** applied to its successor. `remainingAmount` is always `"0"` once paid.
    Web: `PayStatementPanel` shows "Saldo de la facturación anterior" in the breakdown and labels the
    leftover "Pasa a la próxima facturación"; `BillingSection` annotates each period's amount with
    what it inherited and what it rolled over.
    Amendment (a shortfall payment reports PARTIALLY_PAID, 2026-08-13): the carry-forward mechanism
    above is unchanged (any payment settles the period, `amount` freezes at the real total, the
    shortfall rolls into the next period), but a period settled for LESS than its total now derives
    **`PARTIALLY_PAID`** instead of PAID — `PartiallyPaidState` is back
    (`domain/states/partially-paid-state.ts`), chosen in `CreditStatement.state` when `paidAt` is set
    and `paidAmount < amount`. It is TERMINAL, same as PAID (`canPay()`/`canClose()` false): the debt
    lives in the successor period, so nothing is payable here again. Contract's
    `creditStatementStatus` regains the value. **Consequence: "settled" must be tested as
    `paidAt !== null`, never `status === "PAID"`** — `BillingSection` now groups and hides its
    "Pagar" button by `isSettled(s)`, and shows "pagado X de Y" (`billingPaidPartially`) on such a
    period in both layouts; the badge variant is `warning`, and the paid-periods heading became
    "Períodos liquidados"/"Settled periods".
    Amendment (correcting a payment, 2026-08-13): a settled period's PAYMENT is correctable via
    **`PATCH /accounts/:id/credit-statements/:statementId/payment`** (`{amount}`,
    `UpdateStatementPaymentCommand`/Handler, `CreditStatement.changePaidAmount`, contract
    `updateStatementPaymentSchema`) — bounded by the period's computed total
    (`PAYMENT_EXCEEDS_REMAINING`), positive (`INVALID_PAYMENT_AMOUNT`), settled periods only
    (`STATEMENT_NOT_PAID`). This is NOT the retired manual amount correction: the period's total
    still comes from its movements (`sync`) and is never typed in; only `paidAmount` moves. One
    `$transaction` moves everything derived from it — the payment movement's amount, the SOURCE
    account's balance (`incrementBalanceWithTx`), `creditUsed`, and the carry-over on the successor
    period (resolved/created when a period previously paid in full becomes short). Correcting up to
    the full total turns the period back into PAID. Web: `EditStatementPaymentPanel` (a `FormSurface`
    panel showing total / paid-so-far / new amount / what rolls over), opened by the "Modificar pago"
    button that only appears on a PARTIALLY_PAID row; `useAccountMutations.updateStatementPayment`
    invalidates accounts, statements and transactions.
    Amendment (statement reconciliation replaces manual correction, 2026-08-07): the manual
    "correct a PAID statement's amount" is **gone** — `PATCH /accounts/:id/credit-statements/:id`,
    `CorrectStatementAmountCommand`/Handler, `updateCreditStatementSchema`,
    `CreditStatement.correctAmount` and the State's `canCorrectAmount` were all removed (typing a
    number in by hand could agree with nothing). In its place, **`POST
/accounts/:id/credit-statements/:id/sync`** (`SyncStatementCommand`/`SyncStatementHandler`)
    reconciles a period against reality, and its button ("Sincronizar pagos") sits on EVERY row of
    the Facturación table, paid or not. What it does, in one `prisma.$transaction`: (1) recomputes
    the period from its **DATE WINDOW** (`periodStart` → `closedAt ?? now`) via the new
    `TransactionSumsRepositoryPort.netForPeriod` — scoped like the live pool sums (a `CREDIT_LINE`
    counts every movement on the account; any other account counts only EXPENSE through its
    pool-sharing CREDIT cards); (2) **re-links** those movements to this statement
    (`TransactionWriterRepositoryPort.relinkToStatementWithTx`), which is what fixes a movement
    back-dated into a closed period — movements are linked to whichever period was OPEN at creation
    and never re-linked by date; (3) writes the recomputed figure through the new
    `CreditStatement.syncAmount`, which for a SETTLED period also moves `paidAmount` to the new total
    (so it stays PAID) and returns the delta; (4) updates that period's payment movement to the new
    amount (`updateAmountWithTx`) and (5) corrects `BankAccount.creditUsed` by the same delta —
    closing the documented gap where editing a movement of an already-paid period deliberately leaves
    the pool untouched. An unsettled period only gets its stored figure and links fixed (its amount is
    the live sum anyway). Web: `useAccountMutations.syncStatement` invalidates accounts, statements
    AND transactions, since all three can move.
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
    to per-user command scoping], `correct-statement-amount` (both since replaced — see the
    reconciliation amendment below), plus create/update/remove
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
    Amendment (PREPAID is an ACCOUNT, not a card pot — specs/011, 2026-08-14): the previous
    "a prepaid card holds its own money" model is **superseded and removed**. Prepaid is its own
    product: **`AccountType.PREPAID`** — an account with `accountNumber` (required: it is funded by
    transferring to it), institution (bank or non-bank issuer, unfiltered), currency and its own
    balance, which **can never go negative**. `CardAccount.prepaidBalance`/`prepaidInitialBalance`,
    `BankAccount.prepaidPot`, `MovementPolicy.prepaidDelta`, the ports' `prepaidDeltas`,
    `CardAccountRepositoryPort.incrementPrepaidBalanceWithTx`, `accountBalanceDelta`,
    `POST /accounts/:id/cards/:cardId/load` (+ its command/handler), `loadPrepaidCardSchema` and
    `LoadPrepaidPanel` are all **gone**: a prepaid card is a channel onto its account's balance,
    exactly like a debit card, so an expense through one moves the ACCOUNT's `currentBalance` like
    any other. **`CARDABLE_ACCOUNT_TYPES` is replaced by the matrix `ALLOWED_CARD_KINDS`**
    (`@finance/contracts`) + `allowedCardKinds`/`isCardKindAllowed`, with `isCardableAccountType`
    derived from it: CHECKING/SIGHT → DEBIT+CREDIT, CREDIT_LINE → CREDIT, PREPAID → PREPAID,
    SAVINGS/INVESTMENT/CASH → none. Two distinct refusals: `ACCOUNT_CANNOT_HAVE_CARD` (carries no
    cards at all) vs the new **`CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT`**. The "never negative" rule lives
    in `MovementPolicy.assertWithinPrepaidBalance` (now keyed on `account.type === "PREPAID"` and
    reading the new `AccountContext.currentBalance`; an edit passes its own previous amount as the
    offset) and, for the outgoing leg, in `TransferPolicy` (whose context gained `currentBalance` +
    an `outgoingOffset` argument) — error `PREPAID_INSUFFICIENT_BALANCE`, reused with new wording.
    Topping up is an ordinary **traspaso** (spec 010) or an INCOME; a prepaid account never opens a
    `CreditStatement` (no CREDIT card ⇒ `resolveBillingEligibility` false). Also new:
    **`INVALID_INITIAL_BALANCE`** (a prepaid account can't start negative) and
    **`ACCOUNT_TYPE_CHANGE_NOT_ALLOWED`** (a `type` can never be converted to or from PREPAID —
    `BankAccount.applyUpdate`; `AccountTypeToggle` gained `disabledTypes`/`disabledReason` to mirror
    it). `createBankAccountSchema` gained refinements (no negative initial balance, no credit/billing
    settings, inline `cards[]` obey the matrix) and, since each `.refine()` wraps the schema in a
    `ZodEffects`, the PATCH shape now derives from a shared plain-object `bankAccountFieldsSchema`.
    Web: `CardForm` takes `accountType` and offers only the allowed kinds (its "saldo cargado"
    section is gone), `AccountVisualCard` shows the account's balance on every tile, `CardDetailPanel`
    lost its balance block and "Recargar". Seed: the prepaid card no longer hangs off the checking
    account — there's a **"Tenpo Prepago"** `PREPAID` account with two prepaid cards sharing its
    balance, movements with and without a card, and a top-up recorded as a real transfer.
    `docs/PENDING.md` lost its point 6 (the un-revertable card top-up), which this design removes.
  - **Cargo financiero, techo de saldo y deuda en el patrimonio (2026-08-15):** tres huecos que
    encontró una revisión externa. (1) **`Transaction.financeCharge`**: un cobro del EMISOR sobre la
    cuenta de crédito (intereses del rotativo, comisión de mantención, seguro). Antes era IMPOSIBLE
    registrarlo — un `EXPENSE` en cuenta `CREDIT_CARD` exigía tarjeta y ningún plástico hace estos
    cargos —, así que el `carriedOverAmount` nunca podía cuadrar con la cartola. Reglas: EXPENSE, sin
    tarjeta (`CARD_NOT_ALLOWED` si viene una), solo suma al pool en cuenta `CREDIT_CARD`, y **la app
    nunca lo calcula**: se lee del estado de cuenta y se anota, que es lo que evita que este dominio
    invente tasas. `MovementPolicy.contribution` lo refleja para que un edit/delete revierta
    exactamente lo aportado; en la UI es un switch que oculta el campo de tarjeta. (2)
    **`BankAccount.balanceCeiling`** (nullable): la imagen espejo de `overdraftLimit` — CuentaRUT y
    las cuentas prepago tienen máximo regulatorio de saldo, y un ingreso que lo pasa es uno que el
    banco rechazaría (`BALANCE_CEILING_EXCEEDED`, `MovementPolicy.assertWithinCeiling`). Solo en
    SIGHT/PREPAID/SAVINGS y **solo se aplica si hay techo declarado**. (3) **El patrimonio neto resta
    deuda**: `netWorth(cuentas, deudas)` descuenta `creditUsed` y las `Debt` no liquidadas (las que me
    deben suman). **No** suma los planes de cuotas: un plan comprado con tarjeta ya está en los
    movimientos de su cuenta de crédito y contarlo otra vez sería doble. La serie diaria sigue siendo
    solo de saldos — no hay historial de deuda por día y mezclarlos no describiría nada. (4) Un
    **plan de cuotas con interés** carga la diferencia (cuotas − principal) como `financeCharge` sobre
    la cuenta de la tarjeta: el movimiento de compra solo lleva el precio, así que sin esto el cupo
    subestimaba la deuda comprometida. (5) Cupo único multi-moneda: el emisor real descuenta una
    compra en otra moneda del MISMO cupo; sin tipo de cambio la app mantiene los topes separados y
    **lo advierte en `CardDetailPanel`** en vez de mostrar un disponible que el banco no reconocería.
  - **Multi-país: PSP, CBU/CVU y alias (2026-08-15, specs/P3 del informe):** el catálogo deja de ser
    chileno. `InstitutionKind` gana **`PAYMENT_PROVIDER`** — mantiene cuentas de pago (dinero
    electrónico) sin ser banco y sin que su producto sea una tarjeta: es la figura de los **PSP**
    argentinos (CVU), las **SEDPE** colombianas, las **EEDE** peruanas y las **EMPE** paraguayas, mismo
    rol con cuatro nombres regulatorios. **`BankAccount.accountAlias`** guarda el alias de
    transferencia donde el mercado lo tiene (`mate.tango.mp`); null en el resto.
    **`packages/contracts/src/accounts/account-number.ts`**: `accountNumberFormat(alpha2)`,
    `usesAccountAlias`, **`isValidCbu`** (22 dígitos, dos bloques con dígito verificador propio —
    ponderaciones 7,1,3,9,7,1,3 y 3,9,7,1,3,9,7,1,3,9,7,1,3; el mismo validador sirve para CVU, que es
    el punto del esquema), `isValidAccountNumber` e `isValidAccountAlias`. **Permisivo por defecto**:
    un país sin formato conocido acepta cualquier número — igual que el catálogo de instituciones, no
    bloquear una cuenta real por no conocer su mercado. Chile queda como texto libre a propósito (no
    hay formato único ni dígito verificador). Web: `AccountForm` y `AccountCreateModal` ganan
    **selector de país** (antes `"CL"` fijo) que filtra las instituciones y cambia el rótulo a
    "CBU / CVU" + el campo Alias; cambiar de país limpia la institución elegida (pertenece a su país).
    `AccountEditPanel` **deriva** el país de la institución guardada (la cuenta no lo almacena).
    **La validación es de dos lados**: el agregado la impone en
    `BankAccount.assertAccountIdentifiers` (llamada desde create/update account, que resuelven el país
    vía `BankAccountRepositoryPort.institutionCountry` → `FinancialInstitutionLookupPort.countryAlpha2ById`)
    con errores **`INVALID_ACCOUNT_NUMBER`** / **`INVALID_ACCOUNT_ALIAS`**, y ambos formularios web
    bloquean el submit con la misma función del contrato — mostrar el error y guardar igual sería peor
    que no validar.
    Códigos: los emisores solo-crédito (TCEEM) **sí tienen código institucional CMF** — verificado en
    cada ficha: 689 COFISA, 707 Solventa/Cruz Verde, 708 Inversiones y Tarjetas, 288 Unicard/Unipay,
    2527 Matic Kard/sbpay. Solo FISO conserva llave `RUT-` porque su código no fue verificable. El
    seed **retira explícitamente** las llaves viejas (`RETIRED_ISSUER_KEYS`): re-llavear una entidad
    crea la fila nueva y deja huérfana la anterior.
    Seed AR: 9 bancos con su **código de entidad BCRA** (= los 3 primeros dígitos del CBU, por eso es
    la llave natural) y 3 PSP keyed `PSP-<slug>` porque sus prefijos CVU no están publicados en las
    fuentes usadas. Productos AR: la caja de ahorro (`SAVINGS`) es la cuenta cotidiana, la corriente es
    más bien producto de empresa. Pendiente: CO/PE/PY siguen sin instituciones.
  - **`CREDIT_LINE` → `CREDIT_CARD` + `overdraftLimit` (2026-08-15, breaking):** el enum nombraba mal
    justo el concepto que más se confunde. **`AccountType.CREDIT_CARD`** es la cuenta de tarjeta de
    crédito (deuda rotativa, facturación, pago mínimo). La **"línea de crédito"** que un banco da sobre
    una cuenta corriente es otra cosa — un **sobregiro**: no tiene tarjeta, ni estado de cuenta, ni
    movimientos propios; solo deja que el saldo baje de cero. Por eso es **columna
    `BankAccount.overdraftLimit`** (Decimal, default 0) y no un tipo de cuenta. Solo `CHECKING`/`SIGHT`
    pueden tenerlo (`accounts.allowsOverdraft` + refines del contrato + `assertOverdraft` en el
    agregado → **`OVERDRAFT_NOT_ALLOWED`**). `MovementPolicy.assertWithinOverdraft` rechaza el gasto que
    pasaría del piso (**`OVERDRAFT_LIMIT_EXCEEDED`**) **solo cuando hay línea configurada**: sin línea
    declarada la app no tiene base para rechazar un movimiento que de verdad ocurrió (el banco pudo
    permitirlo). Un edit se valida contra el saldo ANTES de su propio cargo previo, igual que prepago.
    Ojo al leer: `"0"` significa _sin_ sobregiro, no "tiene uno de cero" — el primer refine que escribí
    trataba `"0"` como truthy y rompía la creación de cuentas prepago. El renombre tocó 58 archivos
    (incluidas las llaves i18n `accounts.type.*`); los Sync Impact Reports viejos de la constitución
    conservan el nombre anterior por ser historia.
  - **Cooperativas y emisores solo-crédito (2026-08-15):** el catálogo cubría únicamente el registro
    de prepago (TPEEM). Ahora también **TCEEM** (emisores no bancarios con licencia solo de tarjeta de
    crédito: Hites, sbpay/Matic Kard, Cruz Verde/Solventa, Unipay/Unicard, FISO, Inversiones y
    Tarjetas) y las **cooperativas de ahorro y crédito** (registro BCCOO), con `InstitutionKind`
    nuevo **`COOPERATIVE`** — ni banco ni emisora: capta ahorro de sus socios y presta. Productos por
    defecto: cooperativa → SAVINGS*/SIGHT/CREDIT_LINE; emisor solo-crédito → CREDIT_LINE. **Tres
    entidades tienen ambas licencias** (Tenpo 730, Inversiones LP 697, Tricard 699) y siguen siendo
    UNA fila con dos productos — el `kind` dice qué ES la entidad, `institution-account-type` qué
    vende. **`code` cuando no hay código institucional:** estas entidades no reciben transferencias,
    así que no tienen código de transferencia (solo Coopeuch, 672); para el resto la llave natural es
    su RUT con prefijo **`RUT-`**, que lo dice en voz alta en vez de inventar un código de regulador.
    Corrección de dato: **697 Inversiones LP S.A. es La Polar**, no "Lider Bci" (verificado contra los
    T&C de Tarjeta La Polar). Total CL: 46 instituciones, todas con productos catalogados.
  - **`InstallmentPlan.cardId` (2026-08-15):** un plan de cuotas registra con qué tarjeta se compró
    (FK nullable → `CardAccount`, **`onDelete: SetNull`** — borrar la tarjeta no puede borrar la deuda
    que creó). Opcional a propósito: un plan también puede ser un crédito bancario sin tarjeta detrás.
    Expuesto en el contrato (`installmentPlanSchema.cardId` + create/update), elegido en
    `InstallmentCreateModal` (selector de todas las tarjetas de todas las cuentas: el plan habla de la
    deuda, no de los movimientos de una cuenta). Esto habilita **"Cuotas activas"** en `CardDetailPanel`
    — el bloque que el rediseño de tarjetas había dejado fuera por no ser derivable: un plan cuenta
    como activo mientras le quede alguna cuota impaga.
  - **Marca vs. razón social + atributos de tarjeta (2026-08-15):** `FinancialInstitution.name` pasa a
    ser el **nombre comercial** (Copec Pay, Tenpo, BancoEstado, BCI) y la razón social registrada vive
    en **`legalName`**; los selectores etiquetan con `name` y **buscan por los tres** (name, legalName,
    brands) vía el nuevo `keywords` de `SearchableSelectOption` + `domains/reference/lib/institutionOption.ts`.
    Nuevo **`retailFacing`**: las entidades que solo venden a empresas (sucursales extranjeras, Pomelo
    como proveedor BaaS) siguen en el catálogo pero se ocultan de los selectores — `useInstitutions`
    pide siempre `?retailFacing=true`. Razones sociales verificadas contra los registros TPEEM/TCEEM de
    la CMF; los enlaces marca↔entidad salen de los T&C de cada producto (el registro no trae marcas).
    **`CardAccount`** gana cuatro columnas descriptivas que el modelo no podía expresar: `isVirtual`
    (un emisor entrega varias virtuales sobre el mismo saldo), `isAdditional` + `cardholderName` (la
    tarjeta emitida a otra persona: saber QUIÉN gastó es gran parte de lo que esta app agrega sobre la
    cartola del banco) y `network` (enum nuevo **`CardNetwork`**: VISA/MASTERCARD/AMEX/REDCOMPRA/OTHER).
    Todas opcionales y **descriptivas**: ninguna regla depende de ellas todavía. `CardForm` las pide
    (switches + selector de red, el campo de titular solo aparece si la tarjeta es adicional) y
    `CardDetailPanel` las muestra como filas. Falta en el catálogo: el registro TCEEM completo
    (emisores de crédito no bancario) y las cooperativas.
  - **La tarjeta de crédito es su propia cuenta (2026-08-15, breaking, sin spec):** `ALLOWED_CARD_KINDS`
    pasa a **CHECKING/SIGHT/SAVINGS → DEBIT, CREDIT_LINE → CREDIT, PREPAID → PREPAID,
    INVESTMENT/CASH → ninguna**. Ya no existe la "tarjeta de crédito add-on" sobre una cuenta corriente
    o vista: el banco las vende juntas, pero la compra no saca plata de la cuenta — abre deuda rotativa
    con su propio estado de cuenta, ciclo y pago mínimo, así que vive en su cuenta `CREDIT_LINE`.
    Consecuencias: **solo** una `CREDIT_LINE` puede tener cupo/facturación (nuevo error
    **`CREDIT_SETTINGS_NOT_ALLOWED`**, refine en `createBankAccountSchema` + `assertCreditSettings` en el
    agregado), cambiar el `type` se rechaza si dejaría tarjetas huérfanas (`applyUpdate` revalida las
    tarjetas existentes contra la matriz), y `SAVINGS` gana tarjeta `DEBIT` (giro en cajero:
    BancoEstado, Coopeuch). `AddOnCardEligibility` pasó a **`NoCreditLineEligibility`** (la forma add-on
    ya no puede existir; la strategy lo dice en vez de testearlo). El seed modela las dos tarjetas de
    crédito bancarias como cuentas `CREDIT_LINE` propias ("Banco de Chile · Visa Crédito",
    "BancoEstado · Mastercard Crédito") y sus saldos de caja saltan los movimientos cargados a crédito.
    **Esto elimina la limitación documentada** de que no se podía registrar "un pago a esta tarjeta
    add-on" aparte del ingreso normal de la cuenta: ahora el pago de su facturación es un gasto común
    sobre la cuenta que paga. **Sin migración** (data de dev; `pnpm db:seed` la regenera): en producción
    habría que mover cada tarjeta CREDIT a una cuenta nueva con su cupo, facturaciones y movimientos.
    Pendiente y no modelado: `OVERDRAFT_LINE` (la línea de sobregiro real de una cuenta corriente), y
    `CREDIT_LINE` conserva un nombre que la describe mal.
  - **Cash vs. credit (2026-08-15, fix sin spec):** un movimiento cargado a una línea de crédito
    (cualquiera sobre una cuenta `CREDIT_LINE`, o hecho con una tarjeta `CREDIT` sobre cualquier
    cuenta) **no mueve `currentBalance`** — sube `creditUsed`, y la plata sale una sola vez, después,
    al pagar la facturación. La regla vive en `transaction/domain/balance-delta.ts`
    (**`cashDelta`/`reverseCashDelta`/`isChargedToCredit`**), la usan create/update/remove de
    movimientos, y su espejo en el frontend es `drawsOnCredit` (`projectedBalance.ts`) + `balanceAfter.ts`
    (que ahora salta los movimientos con tarjeta CREDIT y devuelve `null` si hay tarjeta pero la cuenta
    no trae `cards`). Esto corrigió tres defectos con una causa común: (1) la compra con tarjeta de
    crédito descontaba el saldo de la cuenta; (2) `POST /accounts/:id/credit-statements/:id/pay` creaba
    su EXPENSE **sin** descontar el saldo de la cuenta origen (rompía `currentBalance = initialBalance +
Σingresos − Σgastos`); (3) corregir el pago sí movía el saldo, sobre una base nunca debitada. Ahora
    pagar descuenta (`incrementBalanceWithTx` dentro del mismo `$transaction`) y `sync` también ajusta
    el saldo del origen cuando corrige el movimiento de pago. **Los saldos guardados con el
    comportamiento viejo no se migran** (data de dev; `pnpm db:seed` la regenera). Abierto y breaking:
    si `CHECKING`/`SIGHT` deberían seguir admitiendo una tarjeta `CREDIT` (una tarjeta de crédito es su
    propia cuenta, no un canal sobre el saldo de la corriente) — hoy la matriz lo permite.
  - **transaction** (specs/005, 007; folder `domains/transaction`): income/expense linked to a `BankAccount` and (optionally) a `Card`. Rules in `transaction/domain/movement-policy.ts` + its command handlers (contract requires `bankAccountId` on create + refine `INCOME ⇒ no card`): INCOME → no card; EXPENSE on CASH → no card; EXPENSE on **CREDIT_LINE → card required** (must belong); EXPENSE on other non-cash accounts → card optional. **Whenever the card used is CREDIT-kind** (on a CREDIT_LINE account, or any other account that's grown one), the amount is checked against **both** the account's shared pool (persisted `creditUsed` + amount ≤ `creditLimit`, error `CARD_LIMIT_EXCEEDED`) **and**, if the card has its own `CardLimit` for that currency, that narrower (still derived) sub-limit too (`sumsForCard`, error `CARD_SUBLIMIT_EXCEEDED`). Creating/editing/deleting a transaction that draws on the shared pool mutates `BankAccount.creditUsed` directly (`BankAccountRepositoryPort.incrementCreditUsedWithTx`, called inside the movement's own `$transaction`) — edits/deletes revert the transaction's old contribution before applying the new one, including when the transaction moves to a different account (see accounts' billing-period amendment above for the linked-transaction/paid-statement exception). Full CRUD from both the Movements view and the Account view (shared `TransactionTable` with edit/delete, plus a `TransactionDetailModal` read-only view opened by clicking a row). Filter query supports `bankAccountId` + `cardId` (bank→card). Error codes: `CARD_REQUIRED`, `CARD_NOT_ALLOWED`, `CARD_ACCOUNT_MISMATCH`, `CARD_LIMIT_EXCEEDED`, `CARD_SUBLIMIT_EXCEEDED`.
    Amendment (paginated list + aggregates endpoint, 2026-08-05): `GET /transactions` is
    **keyset-paginated** and its response shape is now **`{ items, nextCursor }`** (was a bare
    array). `limit` (≤100) + an opaque base64 `cursor` over `(occurredAt desc, id desc)` —
    keyset, not offset, because rows are created/deleted while the user scrolls;
    `TRANSACTION_PAGE_SIZE = 20` in `@finance/contracts` is what the UI requests. **Omitting
    `limit` still returns every match** (`nextCursor: null`), which is what the dashboard's
    month-scoped aggregation relies on. A cursor the API didn't issue throws `INVALID_CURSOR`
    (never silently restarts — that would loop a paginating client). Cursor encode/decode lives
    in `transaction/application/queries/transaction-cursor.ts`; `toListFilter`
    (`transaction-list-filter.ts`) is shared by both read handlers so a page and its summary
    can't describe different sets. New **`GET /transactions/summary`** (declared BEFORE `:id` in
    the Facade, or Nest would match it as an id) returns `{ total, currencyTotals[], categories[] }`
    for the WHOLE filtered set, aggregated in Postgres (`count` + `groupBy(currency,type)` +
    `distinct category`) — the KPI strip, the "N movimientos" count, the category-filter options,
    the create-modal's category combobox and the profile's monthly-movement count all read from
    it, because deriving them from loaded pages yields wrong numbers. New `category` filter
    (case-insensitive `contains`) replaced the old client-side `clientFilter`, which could only
    ever search already-fetched rows; `clientFilter`/`uniqueCategories`/`summarizeByCurrency`
    were deleted from `transactionMetrics.ts` (replaced by `toCurrencyKpis`, which only derives
    the net balance from the API's totals). Web: `useTransactions` keeps returning a plain array
    (via `select: page => page.items`) for the unpaginated consumers, plus new
    `useInfiniteTransactions` (TanStack `useInfiniteQuery`) and `useTransactionsSummary`; both
    scrolling views (`TransactionsRoute` and the account detail's Movimientos tab) load more
    automatically through `shared/ui/infinite-scroll-sentinel.tsx` (IntersectionObserver,
    200px rootMargin, re-armed on each landed page so a short page on a tall screen doesn't
    stall the list).
    Amendment (transfers + attachments, specs/010, 2026-08-11): **a transfer between two of the
    user's own accounts is NOT a new `TransactionType`** — it is **two ordinary rows** (an `EXPENSE`
    on the source + an `INCOME` on the destination) sharing a new column
    **`Transaction.transferGroupId`** (`@@index`), so each account sees its own leg as a normal
    movement and balance deltas / keyset pagination / filters keep working untouched. The contract
    exposes `transferGroupId` on `transactionSchema` plus helpers `isTransfer`/`transferSide`, and the
    pair shapes `createTransferSchema`/`updateTransferSchema`/`transferSchema` (`{transferGroupId,
outgoing, incoming}`). Rules in `transaction/domain/transfer-policy.ts`: two DIFFERENT accounts,
    both the user's (`TRANSFER_ACCOUNT_NOT_FOUND`), destination never `CREDIT_LINE`
    (`TRANSFER_TO_CREDIT_ACCOUNT` — settling a credit line is a statement payment), never a `cardId`
    (`CARD_NOT_ALLOWED`) nor a `creditStatementId`, both amounts positive; the two currencies are each
    account's own and are **never compared** (no FX in this app). Endpoints
    `POST/GET/PATCH/DELETE /transactions/transfers[/:groupId]`, declared **before `:id`** in the
    Facade; `DELETE /transactions/:id` on one leg deletes the PAIR, `PATCH /transactions/:id` on one
    leg answers **409 `TRANSFER_EDIT_AS_PAIR`**. Writes go through
    `saveTransferPair`/`updateTransferPair`/`removeTransferPair`, each ONE `prisma.$transaction`
    covering both rows and every affected balance delta (`netDeltas` collapses per-account deltas, so
    moving a transfer to a third account adjusts three balances correctly).
    **Critical invariant:** since the type enum didn't change, no existing sum excludes a transfer by
    itself — the exclusion lives in the single named predicate **`EXCLUDE_TRANSFERS`**
    (`transaction/application/queries/transaction-list-filter.ts`), applied to
    `GET /transactions/summary`'s `currencyTotals` and `categories` (NOT to `total`, nor to the list:
    both legs are real rows each account must see), and mirrored on the web by `excludeTransfers`
    (`domains/dashboard/lib/metrics.ts`, used by `monthFlow` + `expensesByCategory`). **Any new
    income/expense aggregate must apply it.**
  - **transaction-attachment** (specs/010, domain 22): `TransactionAttachment` (table
    `transaction-attachment`) = a receipt/voucher file on a movement — `storageKey` (`@unique`,
    `u/<userId>/t/<txId>/<attachmentId>-<slug>`, derived from the id so two files named alike
    coexist), `fileName`, `contentType`, `sizeBytes`, FKs to `User` and `Transaction` (both
    `onDelete: Cascade`). Its own aggregate (it is uploaded/deleted without the movement changing)
    with the four layers and its own Facade `GET/POST /transactions/:id/attachments`,
    `GET .../:attachmentId/url`, `DELETE .../:attachmentId`. Upload goes **through the API**
    (`FileInterceptor`, memory storage, 5 MB `limits.fileSize`, mimetype `fileFilter`);
    `AttachmentPolicy` validates the declared type against `ATTACHMENT_CONTENT_TYPES`
    (jpeg/png/webp/pdf) **and the file's magic bytes** (what stops an executable renamed to `.pdf`),
    after checking the movement is the user's through the `transaction` domain's own port (404, never
    403). Reading is a **5-minute signed URL** — the API never proxies bytes. Bytes live behind
    **`ObjectStoragePort`** (`put`/`getSignedUrl`/`delete`/`isConfigured`) with
    `S3ObjectStorageAdapter` (`@aws-sdk/client-s3` + `s3-request-presigner`, endpoint configurable
    for AWS/MinIO/R2/Backblaze); **with no bucket/credentials the feature is INERT** —
    `isConfigured()` false ⇒ `503 ATTACHMENTS_UNAVAILABLE` on upload/url/delete while LIST keeps
    working, so the panel always renders (`docs/PENDING.md`). Deleting removes the row first and the
    object AFTER the transaction; a failed remote delete is logged with its key, never rolled back.
    Web: `AttachmentsSection` + `useAttachments`, with **deferred upload** — files chosen while
    creating a movement are held in memory (validated locally by type and size) and uploaded as soon
    as `POST /transactions` returns an id; one that fails stays listed with **Reintentar**.
  - **recurring-expense**: `RecurringExpense` (subscriptions/rent/periodic payments) — `frequency` (`RecurrenceFrequency`: WEEKLY/MONTHLY/YEARLY), `interval`, `anchorDate`, optional `bankAccountId`/`category`, `active`. The contract exposes a computed `nextDueAt` (anchor stepped forward by frequency × interval). CRUD at `/recurring`.
  - **reference tables** (`country`, `currency`, `country-currency`, `country-identifier-type`, `financial-institution`, `institution-account-type` — one domain each since the one-table-one-domain amendment; global read-only, authed but not user-scoped): `Country` (table `country`, ISO 3166-1 `alpha2`/`alpha3`/`numeric` unique + name), `FinancialInstitution` (table `financial-institution`, **banks + non-bank card issuers** via `kind` `InstitutionKind` BANK/NON_BANK_ISSUER; `code` = SBIF/CMF or código institucional `@@unique([countryId,code])`, `name`, `category` `BankCategory?` ESTABLISHED/FOREIGN_BRANCH/STATE (banks only — unused at runtime, kept for grouping the picker as the catalogue grows past Chile), `brands String[]`, `notes`, FK→Country; **`rut` was dropped** — `code` is the identifier), `Currency` (table `currency`, **ISO 4217** `code` unique + `numeric` + name), and `CountryCurrency` join (`isPrimary`). Endpoints `GET /countries`, `GET /institutions?country=CL&kind=BANK&accountType=PREPAID`, `GET /currencies` (ordered by name). Seeded idempotently in `prisma/seed.ts` (`seedReferenceData`): 6 countries, 18 CL banks + 15 non-bank issuers, 168 currencies, country↔currency links.
    **`InstitutionAccountType`** (table `institution-account-type`, join `institutionId` + `type`
    `AccountType` + `isPrimary`, `@@unique([institutionId,type])`, `onDelete: Cascade`) = **which
    account products an institution actually offers** — Tenpo sells PREPAID today and may sell
    CHECKING tomorrow, a foreign branch sells only CHECKING. Deliberately NOT derived from
    `kind`/`category`, which say what the entity IS (regulation), not what it SELLS; a join table
    rather than a scalar `AccountType[]` because the relation carries attributes of its own
    (`isPrimary` = flagship, ordering only). Exposed as **`Institution.accountTypes`** (flagship
    first) and as the filter `?accountType=`, which is **PERMISSIVE**: an institution with NO rows
    means "not catalogued yet", so it passes every filter and shows up for every account type — a
    reference catalogue always lags reality and a missing row must never hide a real bank. There is
    **no write-side validation**: the filter guides the picker, it never rejects `POST /accounts`.
    The API composes it through `InstitutionAccountTypeRepositoryPort` (`listByInstitutions` +
    `catalogueFor`, which returns `{offering, catalogued}` — "doesn't declare it" and "declares
    nothing" are different answers), never a Prisma `include`. Seed defaults are per bank category
    (ESTABLISHED → CHECKING/SIGHT/SAVINGS/CREDIT_LINE, FOREIGN_BRANCH → CHECKING, STATE → SIGHT
    first for BancoEstado's CuentaRUT) plus per-code overrides, and the seed `deleteMany`s what a
    tuned list no longer contains. Web: `useInstitutions(country, kind, accountType)` — both
    `AccountCreateModal` and `AccountForm` pass the selected type, drop a picked institution only
    when it is KNOWN not to offer the new type (empty catalogue ⇒ kept), and `AccountForm` keeps an
    already-saved institution selectable even if it no longer offers that product.
    `accounts.institutionKindForAccountType` (the older BANK-only heuristic) still runs alongside it.
    **`accountType` (the zod enum) now lives in `packages/contracts/src/common/account-type.ts`** and
    is re-exported from `accounts`: `reference` needs it and `accounts` already imports `reference`,
    so a shared module is what avoids the cycle (same move as `identifierTypeSchema`). Call sites unchanged. **`BankAccount.institutionId`** FK → `FinancialInstitution` (the "institution" selector; scalar `institution` text mirrors its name for display; relation field is `financialInstitution`); web forms use `useInstitutions`/`useCurrencies` selects (`apps/web`'s `domains/reference` — the FRONTEND keeps one reference module; only the backend is split per table).
  - **wallet-item-dashboard**: `WalletItemDashboard` (table `wallet-item-dashboard`) `(accountId? | cardId?, order)` — a user-curated set of pinned cards **or** accounts for the dashboard "wallet" (exactly one of card/account; XOR enforced in its aggregate; `onDelete: Cascade`). Endpoints `GET/POST /wallet`, `PATCH /wallet/reorder` (`{ids[]}`), `DELETE /wallet/:id`.
- **`apps/web`** — **Vite + React 19 SPA**, consumes the API over HTTP only (`shared/lib/apiClient.ts`, `VITE_API_URL`). Domain-first: `src/domains/<domain>/{api,hooks,components,routes}`. Routing **react-router v8** (single `react-router` package — `react-router-dom` no longer exists in v8; every import comes from `react-router`), data via TanStack Query, **owns the es/en i18n catalogs** (`src/i18n`). **Styling: Tailwind CSS** (design tokens as CSS variables in `src/styles/index.css`, dark-mode ready) with shadcn-style primitives in `src/shared/ui` (`button`, `input`, `label`, `field`, `select`, `searchable-select` [button + portaled, fixed-height (`max-h-60`) custom-scrollbar (`scrollbar-thin`) panel with an in-panel search box — for long option lists a native `<select>` can't restyle/height-cap, e.g. institutions (~20 banks) or currencies (168 ISO codes); `displayValue` prop lets the closed control show something narrower than the list label, e.g. a currency's bare ISO code while the open list reads "Name (CODE)"], `combobox` [free-text input + the same portaled dropdown pattern, for fields that accept a value not in the list, e.g. transaction category], `card`, `badge`, `table`, `page-header`, `states`, `theme-toggle`, `switch`, `unsaved-indicator`, `overlay/` [the dialog family — Modal/Window/Drawer/ResponsiveSurface/FormSurface/ConfirmModal, see the overlay amendment below], `tabs`, `segmented`, `sparkline`) + `cn` helper (`shared/lib/cn.ts`); authed routes wrapped by `app/AppLayout.tsx`. The **Panel** (`app/DashboardPage.tsx` + `domains/dashboard`) is a frontend-only aggregation (net worth, month flow, category donut, upcoming payments, wallet). Libraries: **Recharts** (charts), **sonner** (toasts; `<Toaster/>` in `app/providers`), **@dnd-kit** (wallet drag-reorder). No DB access, never imports backend internals.
  Amendment (overlay family, 2026-08-05): `shared/ui/dialog.tsx` and `shared/ui/confirm-dialog.tsx`
  are **gone**, replaced by `shared/ui/overlay/` (barrel `index.ts`): **`SurfaceChrome`** (the shared
  frame — header `leading`/title/description/`headerAside`/close → one scrolling body → pinned
  `footer`; its Title/Description/Close elements are INJECTED so the same chrome works under Radix and
  in a plain route), **`Modal`** (centered Radix card; backdrop is `bg-black/60 backdrop-blur-sm` —
  the blur is deliberate, a scrim alone let same-tone content behind compete with the dialog),
  **`Window`** (full-screen sheet, close control leads), **`ResponsiveSurface`** (the default: picks
  Window below `SHEET_QUERY` = 420px, Modal above — a media query, not CSS classes, because the two
  are different structures and only one is mounted), **`WindowScreen`** (the window frame WITHOUT
  Radix, for a route that becomes a screen — used by `/accounts/:id/edit` on a phone), plus two
  opinionated wrappers: **`FormSurface`** (`mode: "create" | "edit"` — edit shows the
  `UnsavedIndicator` and labels its submit "Guardar cambios"; cancel is hidden on the window form
  where the header's close is already the way out) and **`ConfirmModal`** (**always** a Modal, never a
  sheet: an alert is an interruption, may stack on top of another surface, and destructive-by-default).
  Every previous `<Dialog>` call site is now `<ResponsiveSurface>` and every `<ConfirmDialog>` is
  `<ConfirmModal>`, so ALL modals now become full-screen windows under 420px. Tailwind gained the
  `sheet: 420px` breakpoint (`max-sheet:`/`sheet:`) for the styling that stays CSS-side. A form whose
  submit lives in the window footer wires them with `formId` + `form="<id>"` (one form, one action
  bar) — see `AccountForm`'s `formId`/`hideFooter`.

  Amendment (card detail per format, 2026-08-05): `CardDetailModal` is **gone**. One content
  component, three shells: **`CardDetailPanel`** (visual tile + credit pool/available + rows
  [rol, tipo, titular, vencimiento, origen del tope] + extra-currency pools + "Movimientos de esta
  tarjeta" — count from `GET /transactions/summary?cardId=`, never folded from loaded rows, plus the
  4 most recent) is rendered by: **desktop (≥`xl`)** as an **inline accordion inside `CardsAside`**
  (one card open at a time, no overlay at all; "Editar" swaps that same block for `CardForm`, and
  expanding a card ALSO filters the movements table — `cardFilter` was lifted from `MovementsSection`
  to `AccountDetailRoute` and is shared with the aside via `onSelectCard`); **tablet** as the new
  **`Drawer`** (right-side panel, 62% width, dimmed+blurred backdrop) via
  **`CardDetailSurface`**; **phone** as a full-screen `Window` through the same component. Detail and
  edit are one surface with two modes (the chrome's new `eyebrow` prop names the mode), never stacked
  overlays. `SurfaceChrome` also gained `closePlacement` ("start" for a window's back-out control,
  "end" for a modal's/drawer's dismiss). **Not implemented on purpose:** the handoff's "Marcar
  principal" action / "Tarjeta principal" switch (the primary card is still assigned automatically —
  changing it would move the account-level `creditLimit` mirror, a backend change) and "Cuotas
  activas" (`InstallmentPlan` has no `cardId`, so it isn't derivable).

  Amendment (movement panels, specs/010, 2026-08-11): the movement **detail** and its **create/edit
  form** are both `SidePanel`s built on the new shared primitive **`shared/ui/detail-row.tsx`**
  (label left / value right, interactive variant renders a real button + chevron): amount as the
  protagonist, label/value rows, actions pinned at the foot. `TransactionDetailModal` is now a thin
  shell over **`TransactionDetailPanel`** with paged **‹ ›** in its header (`panelNavigation.ts` — the
  panel makes NO query of its own, it walks the same array the table behind it holds and asks the
  parent for the next page at the end) and Eliminar / **Duplicar** / Editar at the foot (Duplicar
  opens the create form pre-filled, dated today, via the modal's new `duplicateFrom` prop; Eliminar
  still goes through `TransactionDeleteConfirm`). `TransactionCreateModal` is likewise a shell over
  **`TransactionFormPanel`** (+ `TransferFields` for the third "Traspaso" segment) and gained
  **"Guardar y crear otro"** (`FormSurface`'s new `extraActions` slot; clears amount/description/
  category/details, keeps account and date, refocuses the amount — hidden while editing). Two
  client-side figures use `@finance/money`: **`balanceAfter.ts`** (balance after a movement) and
  **`projectedBalance.ts`** (what the account's balance becomes if the form is saved); both return
  `null` — and their row is OMITTED, never approximated — for an account with no balance
  (`CREDIT_LINE`), while a date filter is active, or when the loaded list mixes accounts. Also here:
  `apiClient` no longer forces `Content-Type: application/json` on a `FormData` body (the browser
  must set the multipart boundary), and **`src/i18n/parity.test.ts`** now enforces es/en key parity
  as a test instead of by discipline.

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
- **Styling / design system:** Tailwind utility classes + `src/shared/ui` primitives (button, input, label, field, card, badge, table, page-header, states, theme-toggle, overlay (Modal/Window/ResponsiveSurface/FormSurface/ConfirmModal), tabs, segmented, sparkline). **Tokens are the only source** of color/size (CSS variables in `src/styles/index.css`); never hardcode `#hex`/`rgb()` — use token classes (`bg-background`, `text-muted-foreground`, `text-brand`, `bg-accent`, …). Palette includes the **clay `--accent`** channel (`#F4A261` dark / `#E76F51` light). Theming via `data-theme` on `<html>` (**dark default**, light, system) through `src/theme/ThemeProvider`; icons from **Lucide**, font **Geist** (`@fontsource-variable/geist`, Inter fallback). Full guide: `docs/{english,spanish}/DESIGN_SYSTEM.md`.
  **Breakpoints (stipulated):** Tailwind's DEFAULT scale, with an agreed meaning per step — no custom
  screens: base (no prefix) = **phone**, `sm` 640 = end of phone / start of **tablet**, `md` 768 =
  **tablet**, `lg` 1024 = **tablet**, `xl` 1280 = **widest tablet** (last stop before desktop), `2xl`
  1536 = **desktop** (second columns, per-column scrolling). The
  table lives in **`apps/web/breakpoints.ts`**, which is also the single source the JS media queries read
  (`minWidth(name)` → `DESKTOP_QUERY` = `2xl` in `shared/lib/useMediaQuery.ts`, `SHEET_QUERY` = `sm` in
  `shared/ui/overlay/surface.tsx`). **Never hardcode an arbitrary `min-[NNNpx]:` class or a
  `(min-width: NNNpx)` string, and don't add custom screens** — when a layout's CSS switches at one width
  and its JS at another, the gap is a state nobody designed (this shipped twice: a 1150 query against a
  1540 class hid a desktop aside AND its mobile tab, making cards unreachable; a 420 query against 450
  classes). Consequences of the stipulation: overlays are full-screen `Window`s below `sm` and
  `Modal`/`Drawer` from `sm` up; the account detail's two-column layout (cards aside) starts at `2xl`, so 1280-1535 is still the tablet form (single column + "Tarjetas" tab + card drawer). A within-component split (e.g. `AccountForm`'s section label column at `xl`) is not a stage decision and may still use `xl`.
  **Sidebar:** the persistent rail (collapsible, `localStorage`-backed) only exists from `lg` up; below
  that (phone AND tablet up to 1023) the nav is the hamburger + Radix drawer, since a 240px rail eats a
  quarter of a 768px screen. **Container-width layouts:** when a sibling can change the space available
  (the collapsible sidebar), the decision belongs to the element's OWN width, not the viewport —
  `shared/lib/useElementWidth.ts` (ResizeObserver) does that, and two consumers use it:
  `TransactionTable` picks its full column-per-field table vs. its compact list at
  `FULL_TABLE_MIN_WIDTH` (860px of table, not of screen) — at a 1024px viewport that's the full table
  with the sidebar collapsed (~896px) and the compact one with it expanded (~736px); and
  `AccountDetailRoute`/`AccountEditRoute` decide the whole two-column layout (cards aside + per-column
  scrolling vs. single column + "Tarjetas" tab + card drawer) at `ASIDE_MIN_WIDTH` (1100px of view) —
  at 1280px the aside fits with the sidebar collapsed (~1152px) and doesn't with it expanded (~992px).
  Both fall back to the narrow layout until measured (safe at any width), and the route's former `2xl:`
  layout classes are now conditional (`cn(isDesktop && …)`, threaded into the sections as
  `columnScroll`) so CSS and JS can't disagree. `DESKTOP_QUERY` remains only for genuinely
  viewport-driven cases.
  Tailwind also sets `future.hoverOnlyWhenSupported` so every `hover:` compiles inside
  `@media (hover: hover)` — without it a tap on a touch device leaves the hover state stuck on.
  Amendment (dark-theme repaint from design handoff, 2026-07-17): `--background`/`--card`/`--border`/`--input`/`--muted`/`--muted-foreground`/`--primary-foreground`/`--destructive` were replaced with the exact hex from the handoff palette (`#0b1518`/`#0f1e21`/`#1e2e32`/`#283c41`/`#22343a`/`#8aa0a2`/`#08181b`/`#e08a8a` respectively); `--brand`/`--accent`/`--success` already matched and only got sub-degree hue rounding fixes. `--destructive-foreground` (dark) changed from white to a dark ink (`0 45% 10%`) because the handoff's danger red is light enough that white text on a _solid_ `bg-destructive` button would fail contrast — mirrors how `--primary`/`--accent` already pair a light base color with a dark "ink" foreground; the ~40 `text-destructive`/low-opacity-fill usages elsewhere were unaffected. New tokens from the same handoff, defined in both themes but **not yet consumed by any component** (available for future use — grep before assuming something already uses them): `--surface-2`/`--chip`/`--track`/`--border-2`/`--text-dim` (dark-named concepts; dark values are the handoff hex. **Light values were MISSING until 2026-08-13** — the light theme inherited `:root`'s dark ones, so `bg-chip`/`bg-surface2`/`bg-track`/`border-border2`/`text-dim` painted dark blocks with unreadable text in light mode, e.g. the account cards' icon tiles and type chips; every one of these now has an explicit `[data-theme="light"]` value. Any NEW token must be defined in BOTH blocks) and `--panel-bg`/`--viewer-bg` (light-named concepts from the handoff; dark theme falls back to `--surface-2`/`--card`). Exposed via Tailwind as `surface2`/`chip`/`track`/`border2`/`dim`/`panel`/`viewer`. Explicit hover hex (`primary-hover`/`accent-hover`) from the light-theme handoff were **not** wired in — `Button` still uses the `hover:bg-primary/90` opacity approach.
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

Active plan: specs/011-prepaid-account-product/plan.md
(Cuenta prepago como producto independiente. El prepago deja de ser una tarjeta con pote propio
colgada de una cuenta corriente/vista y pasa a ser un tipo de cuenta: `AccountType.PREPAID`, con
número de cuenta, emisor, moneda y saldo propio, que solo admite tarjetas `PREPAID` (una o varias,
todas gastan el mismo saldo) y cuyo saldo nunca baja de cero. `CardAccount` pierde
`prepaidBalance`/`prepaidInitialBalance`; se elimina `POST /accounts/:id/cards/:cardId/load` y su
panel — cargar es un traspaso (spec 010) o un ingreso normal. `CARDABLE_ACCOUNT_TYPES` se reemplaza
por una matriz tipo-cuenta ↔ kind-tarjeta en `@finance/contracts`. Cambiar el tipo de una cuenta
hacia/desde PREPAID queda prohibido. Sin migración de datos: `db push` + seed rehecho.
**Estado: 011 implementado** (T001-T061; contrato, dominio, API, web, seed, docs y constitución
en v1.34.0).)
Prior plan: specs/010-movement-transfers-attachments/plan.md
(Movimientos: traspasos, comprobantes y paneles rediseñados. Los paneles de detalle y de
crear/editar movimiento pasan al formato del handoff (panel lateral, monto protagonista, filas
etiqueta/valor, acciones al pie) y ganan navegación ‹ › paginada, Duplicar, saldo tras el
movimiento / proyectado y "Guardar y crear otro". Backend nuevo: **traspaso** = dos filas
`Transaction` (`EXPENSE` origen + `INCOME` destino) unidas por una columna nueva `transferGroupId`
— sin tarjeta, sin tocar cupo ni facturación, destino nunca `CREDIT_LINE`, creadas/editadas/
borradas como par en una sola `$transaction`, excluidas de `GET /transactions/summary` vía el
predicado único `EXCLUDE_TRANSFERS`; y **adjuntos** = tabla + dominio nuevos
`transaction-attachment` (dominio 22), archivos en S3 detrás de un `ObjectStoragePort`
(`@aws-sdk/client-s3`, subida multipart por el API, lectura por URL prefirmada, `503
ATTACHMENTS_UNAVAILABLE` mientras no haya credenciales). Fuera de alcance: crear recurrente desde
el formulario, presupuestos por categoría y conversión de moneda.
**Estado: 010 implementado** (T001-T073; traspasos, adjuntos y ambos paneles completos, constitución en v1.29.0).)
Earlier plan: specs/009-ddd-cqrs-architecture/plan.md
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
Prior plans: 010 (traspasos/adjuntos), 009 (backend DDD+CQRS), 008 (user profile), 007 (accounts/movements redesign), 006 (deudas/installments view), 005 (transactions redesign), 004 (account cards modal), 003 (accounts mgmt), 002 (design system), 001 (monorepo).

<!-- SPECKIT END -->

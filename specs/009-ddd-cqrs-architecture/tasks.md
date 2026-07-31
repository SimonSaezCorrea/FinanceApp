# Tasks: Backend DDD + CQRS Architecture Migration

**Input**: Design documents from `specs/009-ddd-cqrs-architecture/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/layer-contracts.md, quickstart.md

**Tests**: Included — Principle IV (TDD, NON-NEGOTIABLE) and spec FR-016/SC-002 require unit
tests for aggregates/handlers to exist and pass without a database.

**Organization**: Phase 3–7 implement the **reference domain** (`accounts`/billing) end to end,
one user story at a time (this is the MVP path). Phase 8 replicates the now-proven pattern to the
remaining 10 domains, one task per domain, in the order FR-017 requires (independently completable,
not necessarily parallel). Phase 9 is polish/docs.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Tooling and scaffolding every later phase depends on.

- [x] T001 Add `@nestjs/cqrs` dependency to `apps/api/package.json` and run `pnpm install`
- [x] T002 [P] Create the mirrored test tree skeleton: `apps/api/test/{unit,integration,e2e}/` with a
      `.gitkeep` each, and add `test:unit`/`test:integration`/`test:e2e` scripts to
      `apps/api/package.json` (Vitest `--dir` per tree)
- [x] T003 [P] Implement `ZodParamsPipe` in `apps/api/src/infra/http/zod-params.pipe.ts` (mirrors
      the existing `ZodValidationPipe`, validates `@Param()` instead of body/query)
- [x] T004 Move any existing colocated `*.spec.ts` files that are NOT part of this migration's
      first domain (`accounts`) out of `src/` into the new `apps/api/test/unit/domains/<domain>/`
      tree unchanged, updating only relative import paths, so `src/` starts empty of tests
      immediately (independent of the rest of the migration timeline)

**Checkpoint**: `@nestjs/cqrs` installed, test tree exists and runs (even if empty), path params
have a validation mechanism ready to use.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared shapes every domain's migration (starting with `accounts`) builds on.
**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [x] T005 Implement `BaseCommandHandler<TCommand, TResult>` (Template Method, FR-007) in
      `apps/api/src/infra/cqrs/base-command.handler.ts` per `contracts/layer-contracts.md`,
      including the `UserScopedCommand`/`SystemCommand` (`scope: "user" | "system"`) split so
      `loadContext` knows when to skip per-user scoping, and the overridable `persist()` step
      that lets a handler wrap multiple aggregates' saves in one `prisma.$transaction(...)`
      (see T029a)
- [x] T006 [P] Implement `BaseQueryHandler<TQuery, TResult>` (same Template Method shape, read-only
      variant — no `persist`/event-publish steps) in
      `apps/api/src/infra/cqrs/base-query.handler.ts`
- [x] T007 [P] Document the per-domain module wiring convention (how a domain's `*.module.ts`
      registers `CqrsModule`, its command/query handlers, and its event listeners) as a code
      comment/example in `apps/api/src/infra/cqrs/README.md`
- [x] T008 Add `CronModule`'s existing cron trigger contract note: confirm
      `BillingGenerationCron` (in `src/infra/cron/billing-generation.cron.ts`) will call the new
      `GenerateAllDueStatementsCommand` post-migration (no code change yet, just confirm the
      command shape from `data-model.md` covers it) — prevents rework in Phase 6

**Checkpoint**: Shared handler base classes exist and have their own unit tests
(`apps/api/test/unit/infra/cqrs/base-command.handler.spec.ts`,
`base-query.handler.spec.ts`, using a fake command/query) — foundation ready for domain work.

---

## Phase 3: User Story 1 - Add a business rule with confidence (Priority: P1) 🎯 MVP

**Goal**: `accounts`/billing's invariants live in aggregates, protected and unit-testable with
zero database access.

**Independent Test**: `CreditStatement.pay()` called twice on the same aggregate throws on the
second call, proven by a unit test with no Postgres connection.

### Tests for User Story 1

- [x] T009 [P] [US1] Unit test: `BankAccount` invariants (cardable types, `ACCOUNT_NUMBER_REQUIRED`,
      credit-limit projection) in `apps/api/test/unit/domains/accounts/domain/bank-account.aggregate.spec.ts`
- [x] T010 [P] [US1] Unit test: `CreditStatement` state transitions (`OPEN→PENDING→PAID`, reject
      double-pay, reject correcting an unpaid one) in
      `apps/api/test/unit/domains/accounts/domain/credit-statement.aggregate.spec.ts`
- [x] T011 [P] [US1] Unit test: each `CreditStatementState` (`Open`/`Pending`/`Paid`) in isolation
      in `apps/api/test/unit/domains/accounts/domain/states/*.spec.ts`
- [x] T012 [P] [US1] Unit test: `BillingEligibilityStrategy` implementations (`CreditLineEligibility`,
      `AddOnCardEligibility`) in
      `apps/api/test/unit/domains/accounts/domain/billing-eligibility.strategy.spec.ts`

### Implementation for User Story 1

- [x] T013 [US1] Create `BankAccount` aggregate in
      `apps/api/src/domains/accounts/domain/bank-account.aggregate.ts` (port over invariants
      currently in `accounts.service.ts`/`cards.service.ts`, per `data-model.md`)
- [x] T014 [US1] Create `CreditStatementState` interface + `OpenState`/`PendingState`/`PaidState`
      in `apps/api/src/domains/accounts/domain/states/` (State pattern, FR-005)
- [x] T015 [US1] Create `CreditStatement` aggregate in
      `apps/api/src/domains/accounts/domain/credit-statement.aggregate.ts` delegating
      `canClose`/`canPay`/`canCorrectAmount` to `this.state` (depends on T014)
- [x] T016 [US1] Create `BillingEligibilityStrategy` interface + `CreditLineEligibility`/
      `AddOnCardEligibility` in `apps/api/src/domains/accounts/domain/billing-eligibility.strategy.ts`
      (Strategy pattern, FR-006 — ports over the `isEligible` logic from `BillingGenerationService`)
- [x] T017 [US1] Create repository ports `BankAccountRepositoryPort`/`CreditStatementRepositoryPort`
      in `apps/api/src/domains/accounts/domain/ports/` (domain-owned interfaces, zero Prisma imports)
- [x] T018 [US1] Create custom domain errors (`StatementAlreadyPaidError`,
      `AccountInactiveError`, etc.) in `apps/api/src/domains/accounts/domain/errors.ts`

**Checkpoint**: `accounts`/billing's business rules are fully aggregate-owned and unit-tested.
Nothing wired to HTTP yet — this story is provable in isolation per its Independent Test.

---

## Phase 4: User Story 2 - React to something that happened (Priority: P2)

**Goal**: State transitions publish domain events; a new reaction attaches without touching the
publisher.

**Independent Test**: Add `LogStatementPaidListener`, pay a statement, confirm it fires with zero
changes to the paying command/handler.

### Tests for User Story 2

- [x] T019 [P] [US2] Unit test: `CreditStatement.pay()`/`.close()`/`BankAccount.deactivate()`
      each return the expected event object in their aggregate spec files (extend T010/T009)

### Implementation for User Story 2

- [x] T020 [P] [US2] Create `StatementClosedEvent`, `StatementPaidEvent`, `AccountDeactivatedEvent`
      in `apps/api/src/domains/accounts/domain/events/`
- [x] T021 [US2] Wire `CreditStatement`/`BankAccount` aggregate methods to collect and return these
      events (depends on T015/T013)
- [x] T022 [US2] Register `CqrsModule` + `EventBus` in `apps/api/src/domains/accounts/accounts.module.ts`
- [x] T023 [US2] Create the reference listener `LogStatementPaidListener` in
      `apps/api/src/domains/accounts/application/events/log-statement-paid.listener.ts`
      (`@EventsHandler(StatementPaidEvent)`, per quickstart.md step 3) — synchronous, the default
      per Clarifications

> **Deferred, not silently skipped**: FR-019's per-listener async opt-in (for a reaction that can
> genuinely wait, e.g. a future notification) has NO task in this phase — `LogStatementPaidListener`
> doesn't need it, and building the opt-in mechanism speculatively before a real async listener
> exists would be premature. Add it as its own task when the first genuinely-async listener is
> actually needed, not before.

**Checkpoint**: Events publish synchronously by default (per Clarifications); the reference
listener proves Observer works without touching the publishing code.

---

## Phase 5: User Story 3 - Change reads without risking writes (Priority: P2)

**Goal**: Commands and queries are fully separate code paths for `accounts`/billing.

**Independent Test**: Reshape `ListCreditStatementsQueryHandler`'s DTO; no command/aggregate file
needs to change.

### Tests for User Story 3

- [x] T024 [P] [US3] Unit test: `PayCreditStatementHandler` using a fake
      `CreditStatementRepositoryPort` (no Prisma) in
      `apps/api/test/unit/domains/accounts/application/commands/pay-credit-statement.handler.spec.ts`
- [x] T025 [P] [US3] Unit test: `GenerateStatementsHandler`/`GenerateAllDueStatementsHandler` in
      `apps/api/test/unit/domains/accounts/application/commands/generate-statements.handler.spec.ts`
- [x] T026 [P] [US3] Unit test: `CorrectStatementAmountHandler` (rejects on non-PAID statement) in
      `apps/api/test/unit/domains/accounts/application/commands/correct-statement-amount.handler.spec.ts`
- [x] T027 [P] [US3] Unit test: `ListCreditStatementsQueryHandler`/`GetAccountQueryHandler` in
      `apps/api/test/unit/domains/accounts/application/queries/*.spec.ts`

### Implementation for User Story 3

- [x] T028 [P] [US3] Create commands `PayCreditStatementCommand`, `GenerateStatementsCommand`,
      `CorrectStatementAmountCommand` (all `scope: "user"`) and `GenerateAllDueStatementsCommand`
      (`scope: "system"`, no `userId` — the cron trigger, per `data-model.md`) in
      `apps/api/src/domains/accounts/application/commands/*.command.ts`
- [x] T029 [US3] Implement `PayCreditStatementHandler` extending `BaseCommandHandler` in
      `apps/api/src/domains/accounts/application/commands/pay-credit-statement.handler.ts`
      (depends on T005, T015, T017) — its `handle()` step touches THREE aggregates
      (`CreditStatement`, the new payment `Transaction`, `BankAccount`), so its `persist()` MUST
      use the cross-aggregate transactional override (see next task), never three independent
      `save()` calls
- [x] T029a [US3] Add `saveWithTx(tx, aggregate)` to `BankAccountRepositoryPort`/
      `CreditStatementRepositoryPort` (and their Prisma adapters from T034) and override
      `PayCreditStatementHandler.persist()` to wrap all three saves in one
      `prisma.$transaction(...)`, per `contracts/layer-contracts.md`'s "Cross-aggregate
      persistence" section (closes FR-020's atomicity requirement — depends on T029, T034)
- [x] T029b [P] [US3] Integration test: force a failure on the THIRD save inside
      `PayCreditStatementHandler`'s transaction (e.g. a broken `BankAccount` write) and assert
      the `CreditStatement` and payment `Transaction` writes are ALSO rolled back — proves the
      atomicity guarantee, not just that all three succeed on the happy path — in
      `apps/api/test/integration/domains/accounts/application/pay-credit-statement.transaction.spec.ts`
      (depends on T029a)
- [x] T030 [US3] Implement `GenerateStatementsHandler`/`GenerateAllDueStatementsHandler` in
      `apps/api/src/domains/accounts/application/commands/generate-statements.handler.ts`
      (ports over `BillingGenerationService`, depends on T016)
- [x] T031 [US3] Implement `CorrectStatementAmountHandler` in
      `apps/api/src/domains/accounts/application/commands/correct-statement-amount.handler.ts`
- [x] T032 [P] [US3] Create queries `ListCreditStatementsQuery`, `GetAccountQuery` in
      `apps/api/src/domains/accounts/application/queries/*.query.ts`
- [x] T033 [US3] Implement `ListCreditStatementsQueryHandler`/`GetAccountQueryHandler` extending
      `BaseQueryHandler` in `apps/api/src/domains/accounts/application/queries/*.handler.ts`
- [x] T034 [US3] Implement `PrismaBankAccountRepository`/`PrismaCreditStatementRepository`
      (Adapter, FR-011) in `apps/api/src/domains/accounts/infrastructure/prisma-*.repository.ts`,
      implementing the ports from T017 — the only files in this domain allowed to import
      `@prisma/client`
- [x] T035 [US3] Rewrite `apps/api/src/domains/accounts/presentation/accounts.controller.ts` as a
      thin Facade (FR-012): translate request → command/query via `CommandBus`/`QueryBus`, using
      `ZodParamsPipe` (T003) for every path param — remove the old `accounts.service.ts`/
      `accounts.repository.ts` business logic entirely once every call site is migrated
- [x] T036 [US3] Integration test: `PrismaCreditStatementRepository` against the real test DB in
      `apps/api/test/integration/domains/accounts/infrastructure/prisma-credit-statement.repository.spec.ts`
- [x] T037 [US3] E2E test: full pay/generate/correct HTTP flows in
      `apps/api/test/e2e/domains/accounts/accounts.http.spec.ts` (must pass identically to the
      pre-migration behavior — SC-001)

**Checkpoint**: `accounts`/billing fully migrated end to end — old `accounts.service.ts`/
`accounts.repository.ts`/`billing-generation.service.ts` retired, all traffic through
Command/Query buses, all tests (unit/integration/e2e) passing.

---

## Phase 6: User Story 4 - Run tests at the right speed (Priority: P3)

**Goal**: `accounts`'s tests are cleanly split and independently runnable (already true by
construction from Phases 3–5, given tests were written into the mirrored tree from the start) —
this phase validates and documents the pattern for reuse.

**Independent Test**: `pnpm --filter @finance/api test:unit` and `test:integration` each target
only their own tree and pass independently.

- [x] T038 [US4] Confirm zero database connections open during `test:unit` for `accounts` (stop
      local Postgres, re-run `test:unit`, confirm pass) — document the check in `quickstart.md`
      step 1 as verified
- [x] T039 [US4] Add a root `pnpm --filter @finance/api test` convenience script that runs all
      three trees in sequence (unit → integration → e2e), for CI/local full-suite runs

**Checkpoint**: The three-tier test split is proven on a real (not toy) domain.

---

## Phase 7: User Story 5 - Extend the pattern without guesswork (Priority: P4)

**Goal**: Documentation lets a new domain be built correctly without reverse-engineering
`accounts`.

**Independent Test**: Someone unfamiliar with the codebase can predict where a new rule/command/
query/event goes, from docs alone.

- [x] T040 [P] [US5] Update `CLAUDE.md`'s `accounts` architecture section to describe the new
      four-layer structure, replacing the old flat-service description (keep prior amendments as
      history, add a new dated amendment per existing convention)
- [x] T041 [P] [US5] Update `.specify/memory/constitution.md`: bump version, add the DDD+CQRS
      pattern as a durable principle/constraint (four layers, Command/Query separation, event
      dispatch defaults, pattern list from spec FR-005–FR-014)
- [x] T042 [P] [US5] Update `docs/english/ARCHITECTURE.md` and `docs/spanish/ARCHITECTURE.md` (kept
      in parity) with the full four-layer pattern description + the `accounts` reference tree
- [x] T043 [P] [US5] Update `docs/english/BANKING_LOGIC.md` and `docs/spanish/BANKING_LOGIC.md`:
      replace file/path references to the old `accounts.service.ts`/`billing-generation.service.ts`
      locations with the new aggregate/handler paths (business rules unchanged, only their home)
- [x] T044 [US5] Cross-read all four updated documents (`CLAUDE.md`, constitution, both
      `ARCHITECTURE.md`) and confirm no contradictions (SC-004a) — fix any found

**Checkpoint**: Documentation parity achieved; `accounts` is now a citable reference for the
remaining domains.

---

## Phase 8: Domain Rollout (remaining 10 domains)

**Purpose**: Replicate the proven `accounts` pattern to every other domain, one at a time (FR-017
— each independently completable/shippable, not required to be parallel).

**⚠️ These 10 tasks are placeholders, not implementable units-of-work as written.** Each one
bundles an entire domain's migration (aggregates + states/strategies where applicable +
commands/queries + repository ports/adapters + Facade controller + mirrored unit/integration/e2e
tests — realistically 10–15 sub-tasks each, the same granularity as T009–T037 for `accounts`).
**Before starting any of T045–T054**, expand it into its own T0xx-shaped checklist (tests →
aggregates/states/strategies → commands/queries → adapters → controller → checkpoint), following
the exact Phase 3–5 pattern, then work that expanded list — do not attempt the one-line version
literally.

- [x] T045 [auth] Migrate `auth` domain to the four-layer pattern (aggregate: `User` invariants —
      e.g. `ACCOUNT_DISABLED` login rejection; likely no State/Strategy needed — see plan.md
      Structure Decision for the per-domain shape). Expanded/executed as: domain (`user.aggregate.ts`,
      `errors.ts`, `events/user-deactivated.event.ts`, `ports/user.repository.port.ts`) → application
      (`token-issuer.ts` + commands `Register/Login/RefreshToken` as `SystemCommand` per the
      `GenerateAllDueStatementsCommand` precedent, `UpdateProfile/ChangePassword/UpdatePreferences/DeactivateAccount` as `UserScopedCommand`, query `GetMe`) → infrastructure
      (`prisma-user.repository.ts`, only file importing `@prisma/client`, maps `P2002` to
      `EmailTakenError`) → presentation (`auth.controller.ts` rewritten as a thin Facade over
      `CommandBus`/`QueryBus`, cookie-setting kept as a presentation concern). Old `auth.service.ts`/
      `auth.repository.ts`/`auth.controller.ts` retired. `JwtAuthGuard` left unchanged (still queries
      `PrismaService` directly for the `ACTIVE`-status check — cross-cutting infra, no new dependency
      on the migrated domain introduced, per FR-011). Tests: unit (`domain/user.aggregate.spec.ts`,
      `application/commands/*.spec.ts`, `application/queries/get-me.handler.spec.ts` — 173/173 passing
      with zero DB), integration (`infrastructure/prisma-user.repository.spec.ts`) and e2e
      (`e2e/domains/auth/auth.http.spec.ts`) written but not run here (no reachable Postgres in this
      sandbox). `pnpm --filter @finance/api typecheck`, `test:unit`, `check:boundaries`, and
      `pnpm --filter @finance/web typecheck` all verified green.
- [x] T046 [transactions] Migrate `transactions` domain (aggregate: `Transaction` +
      its credit-pool contribution/statement-linking rules currently in `transactions.service.ts`
      — this one is tightly coupled to `accounts`'s `CreditStatement`; coordinate ports carefully)
- [x] T047 [installments] Migrate `installments` domain (aggregate: `InstallmentPlan` +
      `InstallmentPayment` pay/unpay invariants). Expanded/executed as: domain
      (`installment-plan.aggregate.ts` — `planCreation` factory ports the equal-principal
      schedule generation from `@finance/money`'s `equalPrincipalSchedule` + due-date stepping
      unchanged, `markPaymentPaid`/`markPaymentUnpaid` enforce the "payment must exist on this
      plan" invariant (`INSTALLMENT_PAYMENT_NOT_FOUND`), intentionally idempotent (no
      already-paid error, mirrors the pre-migration repository); `errors.ts`
      (`InstallmentPlanNotFoundError`/`InstallmentPaymentNotFoundError`, both 404); `ports/installment-plan.repository.port.ts`, zero Prisma imports) → application (commands
      `CreateInstallmentPlan`/`UpdateInstallmentPlan`/`PayInstallment`/`UnpayInstallment`/
      `RemoveInstallmentPlan` as `UserScopedCommand`, extending `BaseCommandHandler`; pay/unpay
      load the full plan to validate ownership + the invariant, then persist only that payment's
      `paidAt` via `setPaymentPaidAt` — never a full-plan rewrite; queries `ListInstallmentPlans`/
      `GetInstallmentPlan` extending `BaseQueryHandler`) → infrastructure
      (`prisma-installment-plan.repository.ts`, only file importing `@prisma/client`) →
      presentation (`installments.controller.ts` rewritten as a thin Facade over
      `CommandBus`/`QueryBus`, `ZodParamsPipe` on every path param including a new
      `installment-payment.params.ts` coercing `:seq` to a positive int). Old
      `installments.service.ts`/`installments.repository.ts`/root `installments.controller.ts`
      retired. Tests: unit (`domain/installment-plan.aggregate.spec.ts`,
      `application/commands/*.spec.ts`, `application/queries/get-installment-plan.handler.spec.ts`
      — all passing with zero DB), integration
      (`infrastructure/prisma-installment-plan.repository.spec.ts`) and e2e
      (`e2e/domains/installments/installments.http.spec.ts`) written but not run here (no
      reachable Postgres in this sandbox). `pnpm --filter @finance/api typecheck`, `test:unit`
      (190/190 passing across 43 files), `check:boundaries`, and `pnpm --filter @finance/webtypecheck` all verified green.
- [x] T048 [debts] Migrate `debts` domain (aggregate: `Debt` settle/unsettle invariants). Expanded/
      executed as: domain (`debt.aggregate.ts` — `planCreation` factory ports the plain field
      mapping from `DebtsService.create`, `settle()` sets `settledAt` directly with no guard
      (mirrors the pre-migration behavior exactly — it never checked prior state either),
      `unsettle()` enforces `DEBT_NOT_SETTLED`, `registerPayment()` enforces
      `DEBT_ALREADY_SETTLED`/`ALL_INSTALLMENTS_PAID` and auto-settles on the last installment,
      `undoPayment()` enforces `NO_PAYMENTS_TO_UNDO` and clears `settledAt` if the undone payment
      had settled it; `errors.ts` (`DebtNotFoundError` 404, the other four 409 — matches the
      pre-migration `NotFoundException`/`ConflictException` split); `ports/debt.repository.port.ts`,
      zero Prisma imports) → application (commands `CreateDebt`/`UpdateDebt`/`SettleDebt`/
      `UnsettleDebt`/`RegisterDebtPayment`/`UndoDebtPayment`/`RemoveDebt` as `UserScopedCommand`,
      extending `BaseCommandHandler`; queries `ListDebts`/`GetDebt` extending `BaseQueryHandler`) →
      infrastructure (`prisma-debt.repository.ts`, only file importing `@prisma/client`) →
      presentation (`debts.controller.ts` rewritten as a thin Facade over `CommandBus`/`QueryBus`,
      `ZodParamsPipe` + `debt-id.params.ts` on every path param). Old `debts.service.ts`/
      `debts.repository.ts`/root `debts.controller.ts` retired, along with the old colocated
      `debts.service.spec.ts`. Tests: unit (`domain/debt.aggregate.spec.ts`,
      `application/commands/*.spec.ts`, `application/queries/get-debt.handler.spec.ts` — all
      passing with zero DB), integration (`infrastructure/prisma-debt.repository.spec.ts`) and e2e
      (`e2e/domains/debts/debts.http.spec.ts`) written but not run here (no reachable Postgres in
      this sandbox). `pnpm --filter @finance/api typecheck`, `test:unit` (213/213 passing across 48
      files), `check:boundaries`, and `pnpm --filter @finance/web typecheck` all verified green.
- [x] T049 [recurring] Migrate `recurring` domain (aggregate: `RecurringExpense`,
      `nextDueAt` computation). Expanded/executed as: domain
      (`recurring-expense.aggregate.ts` — `planCreation` factory ports the plain
      field mapping/defaults (`category`/`bankAccountId`/`notes` → `null`,
      `active` → `true`) from `recurring.service.ts`'s inline object;
      `nextDue`/`startOfTodayUTC` free functions ported byte-for-byte from the
      old service (still pure, zero DB); no settle-like state machine — `active`
      is just another `applyUpdate` field, mirroring the pre-migration
      `RecurringService.update`'s partial-patch exactly; `errors.ts`
      (`RecurringExpenseNotFoundError`, 404); `ports/recurring-expense.repository.port.ts`, zero Prisma imports) → application
      (commands `CreateRecurringExpense`/`UpdateRecurringExpense`/
      `RemoveRecurringExpense` as `UserScopedCommand`, extending
      `BaseCommandHandler`; queries `ListRecurringExpenses`/`GetRecurringExpense`
      extending `BaseQueryHandler`, both computing `nextDueAt` at read time via
      `startOfTodayUTC(new Date())` same as before) → infrastructure
      (`prisma-recurring-expense.repository.ts`, only file importing
      `@prisma/client`; `save()` uses `Prisma.RecurringExpenseUncheckedUpdateInput`
      so the scalar `bankAccountId` FK can be patched directly, matching the
      pre-migration repository's `updateMany`) → presentation
      (`recurring.controller.ts` rewritten as a thin Facade over
      `CommandBus`/`QueryBus`, `ZodParamsPipe` + new `recurring-id.params.ts` on
      every path param). Old `recurring.service.ts`/`recurring.repository.ts`/
      root `recurring.controller.ts` retired, along with the old colocated
      `recurring.service.spec.ts`. Tests: unit
      (`domain/recurring-expense.aggregate.spec.ts` — covers `nextDue` across
      WEEKLY/MONTHLY/YEARLY plus `planCreation`/`applyUpdate`/`toContract`,
      `application/commands/*.spec.ts`, `application/queries/recurring-expense.handlers.spec.ts` — all passing with zero DB),
      integration (`infrastructure/prisma-recurring-expense.repository.spec.ts`)
      and e2e (`e2e/domains/recurring/recurring.http.spec.ts`) written but not
      run here (no reachable Postgres in this sandbox). `pnpm --filter@finance/api typecheck`, `test:unit` (223/223 passing across 52 files),
      `check:boundaries`, and `pnpm --filter @finance/web typecheck` all
      verified green.
- [x] T050 [savings] Migrate `savings` domain (aggregate: `SavingsGoal` + `SavingsEntry`).
      Expanded/executed as: domain (`savings-goal.aggregate.ts` — `planCreation` factory ports
      the plain field mapping/defaults (`deadline` → `null`) from `SavingsService.createGoal`'s
      inline object; `applyUpdate` is a plain partial-patch, mirroring the pre-migration
      `SavingsService.updateGoal` exactly (no settle-like state machine); `savings-entry.aggregate.ts`
      — immutable, `planCreation` only, matching the pre-migration service which never exposed
      update/delete for entries; `errors.ts` (`SavingsGoalNotFoundError`, 404); `ports/savings-goal.repository.port.ts` + `ports/savings-entry.repository.port.ts`, zero Prisma
      imports) → application (commands `CreateSavingsGoal`/`UpdateSavingsGoal`/`RemoveSavingsGoal`/
      `CreateSavingsEntry` as `UserScopedCommand`, extending `BaseCommandHandler`; queries
      `ListSavingsGoals`/`GetSavingsGoal`/`ListSavingsEntries` extending `BaseQueryHandler`) →
      infrastructure (`prisma-savings-goal.repository.ts` + `prisma-savings-entry.repository.ts`,
      the only two files in this domain allowed to import `@prisma/client`) → presentation
      (`savings.controller.ts` rewritten as a thin Facade over `CommandBus`/`QueryBus`,
      `ZodParamsPipe` + new `savings-goal-id.params.ts` on every path param). Old
      `savings.service.ts`/`savings.repository.ts`/root `savings.controller.ts` retired, along with
      the old colocated `savings.service.spec.ts`. Tests: unit (`domain/savings-goal.aggregate.spec.ts`,
      `domain/savings-entry.aggregate.spec.ts`, `application/commands/*.spec.ts`,
      `application/queries/*.spec.ts` — all passing with zero DB), integration
      (`infrastructure/prisma-savings-goal.repository.spec.ts`,
      `infrastructure/prisma-savings-entry.repository.spec.ts`) and e2e
      (`e2e/domains/savings/savings.http.spec.ts`) written but not run here (no reachable Postgres
      in this sandbox). `pnpm --filter @finance/api typecheck`, `test:unit` (240/240 passing across
      59 files), `check:boundaries`, and `pnpm --filter @finance/web typecheck` all verified green.
- [x] T051 [investments] Migrate `investments` domain (aggregate: `Investment`,
      ETF price-cache read path as a query)
- [x] T052 [import] Migrate `import` domain (command: bulk-import rows; likely
      command-only, no long-lived aggregate — confirmed genuinely so: no
      state machine, no invariant beyond what
      `importTransactionsRequestSchema` already validates at the HTTP
      boundary). Expanded/executed as: domain (`import-batch.ts` — a static
      `ImportBatch.planCreation` factory, the domain's entire footprint,
      parsing each row's `occurredAt` string to a `Date` and defaulting
      `category`/`description`/`bankAccountId` to `null`; no aggregate class,
      no `errors.ts` — deliberately not invented, per the task's own
      guidance; `ports/import-transactions.repository.port.ts`, zero Prisma
      imports) → application (command `ImportTransactionsCommand` as
      `UserScopedCommand`; `ImportTransactionsHandler` extends
      `BaseCommandHandler` — `handle()` calls the repository directly, so
      `persist()` stays the default no-op, same shape as
      `CreateSavingsEntryHandler`; no query needed — this domain is
      write-only, nothing of its own to read back) → infrastructure
      (`prisma-import.repository.ts`, the only file importing
      `@prisma/client` via `PrismaService.transaction.createMany`) →
      presentation (`import.controller.ts` moved under `presentation/`,
      rewritten as a thin Facade over `CommandBus`). Old
      `import.service.ts`/root `import.controller.ts` retired, along with the
      old colocated `import.service.spec.ts`. Tests: unit
      (`domain/import-batch.spec.ts`,
      `application/commands/import-transactions.handler.spec.ts` — all
      passing with zero DB), integration
      (`infrastructure/prisma-import.repository.spec.ts`) and e2e
      (`e2e/domains/import/import.http.spec.ts`) written but not run here (no
      reachable Postgres in this sandbox). `pnpm --filter @finance/apitypecheck`, `test:unit` (255/255 passing across 64 files),
      `check:boundaries`, and `pnpm --filter @finance/web typecheck` all
      verified green.
- [x] T053 [wallet] Migrate `wallet` domain (aggregate: `WalletItemDashboard`
      XOR card/account invariant)
- [x] T054 [reference] Migrate `reference` domain (read-only — per Clarifications,
      still gets full structure: queries only, no commands, since there are no writes to protect).
      Expanded/executed as: domain (no aggregate — genuinely no invariant to protect, per the
      task's own guidance; no `errors.ts` either, the pre-migration controller never threw;
      `domain/ports/{country,institution,currency}.repository.port.ts`, zero Prisma imports, each
      returning the `@finance/contracts` `reference` shape directly since there's no domain object
      model to map through) → application (queries `ListCountriesQuery`/`ListInstitutionsQuery`/
      `ListCurrenciesQuery` — global data, no `userId` to scope by, so each is a `SystemQuery`
      (`scope: "system"`, the `SystemCommand` type reused/aliased exactly like
      `GenerateAllDueStatementsCommand`'s precedent), not a `UserScopedQuery`; their
      `*QueryHandler`s extend `BaseQueryHandler` with a no-op `loadContext`) → infrastructure
      (`prisma-country.repository.ts`/`prisma-institution.repository.ts`/
      `prisma-currency.repository.ts`, the only three files in this domain allowed to import
      `@prisma/client`, each owning the row→contract mapping ported byte-for-byte from the old
      `reference.service.ts`) → presentation (`reference.controller.ts` moved under
      `presentation/`, rewritten as a thin Facade over `QueryBus` only — no `CommandBus`, this
      domain is genuinely command-free). Old `reference.service.ts`/`reference.repository.ts`/root
      `reference.controller.ts` retired, along with the old colocated `reference.service.spec.ts`.
      Tests: unit (`application/queries/list-{countries,institutions,currencies}.handler.spec.ts`
      — all passing with zero DB, fake ports), integration
      (`infrastructure/prisma-{country,institution,currency}.repository.spec.ts`, against the real
      seeded reference data) and e2e (`e2e/domains/reference/reference.http.spec.ts`, auth
      required + country/kind filters) written but not run here (no reachable Postgres in this
      sandbox). `pnpm --filter @finance/api typecheck`, `test:unit` (268/268 passing across 70
      files), `check:boundaries`, and `pnpm --filter @finance/web typecheck` all verified green.
      This completes all 11 domains (SC-004).

**Checkpoint**: All 11 domains on the new architecture (SC-004). Re-run full
`pnpm --filter @finance/api test && pnpm --filter @finance/api typecheck` after each domain.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T055 [P] Apply the Decorator pattern (FR-013) for logging/timing around command/query
      handlers via a shared NestJS interceptor in `apps/api/src/infra/cqrs/handler-logging.interceptor.ts`,
      applied first to `accounts` then to each domain as it's migrated
- [x] T056 [P] Remove now-dead code: old `*.service.ts`/`*.repository.ts` files per domain once
      their replacement is verified (do this per-domain immediately after that domain's checkpoint,
      not in one big pass at the end)
- [x] T057 Run `pnpm --filter @finance/api test`, `pnpm --filter @finance/api typecheck`, and
      `pnpm --filter @finance/web typecheck` (contracts unchanged, but confirm) as the final gate
- [x] T058 Run the full `quickstart.md` validation guide end to end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story.
- **US1 (Phase 3)**: Depends on Foundational. No dependency on other user stories.
- **US2 (Phase 4)**: Depends on US1 (needs the aggregates to emit events from).
- **US3 (Phase 5)**: Depends on US1 (aggregates) and US2 (events to publish from handlers) —
  this is where `accounts` becomes fully wired to HTTP.
- **US4 (Phase 6)**: Depends on US3 (needs real handler/adapter tests to already exist to validate
  the split).
- **US5 (Phase 7)**: Depends on US3 (documents the now-proven pattern).
- **Domain Rollout (Phase 8)**: Depends on Phase 7 (documented pattern) — each domain task is
  independently completable, but `transactions` (T046) should follow `accounts` (already done in
  Phase 3–5) given their coupling on `CreditStatement` linking.
- **Polish (Phase 9)**: Ongoing per-domain (T055/T056) plus a final gate (T057/T058) after Phase 8.

### Parallel Opportunities

- T002/T003 (Setup) in parallel.
- T005/T006/T007 (Foundational) mostly parallel (T008 is just a confirmation, no real dependency).
- All T009–T012 (US1 tests) in parallel — different aggregate/state/strategy files.
- T020 (US2 events) parallel with nothing else in that phase (T021 depends on it).
- T024–T027 (US3 tests) and T028/T032 (command/query shape files) in parallel.
- T040–T043 (US5 docs) in parallel — different files.
- Phase 8 domain tasks are NOT parallel by mandate (FR-017: one domain at a time) even though they
  touch different files — this is a deliberate process constraint, not a technical one.

---

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1).
2. **STOP and VALIDATE**: `CreditStatement`/`BankAccount` invariants are aggregate-owned and
   unit-tested — this alone already delivers User Story 1's value, even with the old
   service/controller still calling into these aggregates temporarily if needed.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → aggregates protect invariants (provable in isolation).
3. US2 → events publish (still provable without full HTTP rewiring).
4. US3 → `accounts` fully cut over to Command/Query + HTTP — **this is the real "domain migrated"
   milestone or `accounts`.**
5. US4 → test-split validated on a real domain.
6. US5 → pattern documented — unblocks Phase 8.
7. Phase 8 → roll out to the other 10 domains, one at a time, each following the same T0xx shape.
8. Phase 9 → polish, remove dead code per domain, final gate.

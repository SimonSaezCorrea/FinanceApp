# Tasks: Facturación separada por moneda en tarjetas de crédito

**Input**: Design documents from `/specs/028-multi-currency-billing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: REQUIRED — Constitution Principle IV (TDD). Within each story, test tasks come first and
MUST fail before the implementation task that makes them pass.

**Organization**: by user story (US1 una facturación por moneda · US2 pagar en otra moneda · US3 traspaso).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Add `currency String @default("CLP")` (the default only backfills existing rows — all CLP; every new period is created with its currency explicitly, research R1), `transferredAt DateTime?`, `transferredAmount Decimal(18,4)?`, `transferTransactionId String? @unique`, `settlementTransactionId String? @unique`, `transferredToId String?` and `@@index([accountId, currency, closedAt])` to `CreditStatement`, and `settlesStatementId String?` (FK → CreditStatement, `onDelete: SetNull`, `@@index`) + its back-relation to `Transaction`, in apps/api/prisma/schema.prisma (research R1, R4; data-model.md)
- [X] T002 Seed: add the system category `CURRENCY_TRANSFER` (EXPENSE, `isSystem: true`) to `CATEGORY_CATALOGUE` and set `currency` on every seeded `CreditStatement` (its account's currency) in apps/api/prisma/seed.ts
- [X] T003 Run `pnpm db:push && pnpm db:seed` and `pnpm --filter @finance/api exec prisma generate`; confirm existing statements got their account's currency
- [X] T004 [P] Add i18n keys (es + en, identical): `categories.CURRENCY_TRANSFER`, `accounts.statementStatus.TRANSFERRED`, `errors.{STATEMENT_NOT_TRANSFERABLE,STATEMENT_NOT_TRANSFERRED,TRANSFER_ALREADY_BILLED,STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS,TRANSACTION_LINKED_TO_STATEMENT,CARD_LIMIT_HAS_DEBT}`, `transactions.source.{STATEMENT_SETTLEMENT,CURRENCY_TRANSFER}` in apps/web/src/i18n/es.json and apps/web/src/i18n/en.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: no user story work begins until this phase is complete.

- [X] T005 [P] Write failing contract tests for `creditStatementStatus` including `TRANSFERRED`, `creditStatementSchema.currency/transferredAt/transferredAmount/transferredToId/canTransfer`, `isSettled(s)` (true for `paidAt` or `transferredAt`) and `canTransferStatement(s, accountCurrency, today)` (foreign, closed, not settled, remaining > 0, due date passed or null) in packages/contracts/src/accounts/credit-statement.test.ts
- [X] T006 Implement T005 in packages/contracts/src/accounts/index.ts (status enum, schema fields, `isSettled`, `canTransferStatement`, `payStatementSchema.chargedAmount`, `transferStatementSchema {amount, transferredAt?}`, `updateStatementPaymentSchema.chargedAmount`)
- [X] T007 [P] Write failing tests for `transactions.sourceOf` returning `STATEMENT_SETTLEMENT` (row has `settlesStatementId`) and `CURRENCY_TRANSFER` (row has `transferStatementId`), both evaluated before `FINANCE_CHARGE`, in packages/contracts/src/transactions/source.test.ts
- [X] T008 Implement T007: `transactionSchema.settlesStatementId/transferStatementId/transferStatementAccountId` and the two new `sourceOf` cases in packages/contracts/src/transactions/index.ts; rebuild with `pnpm --filter @finance/contracts build`
- [X] T009 [P] Write failing aggregate tests: `currency` getter; `state` is `TransferredState` when `transferredAt` is set and it is terminal (`canPay`/`canClose`/`canPrepay`/`canTransfer` false) in apps/api/test/unit/domains/credit-statement/domain/credit-statement.aggregate.spec.ts and apps/api/test/unit/domains/credit-statement/domain/states/transferred-state.spec.ts
- [X] T010 Add `canTransfer()` to `CreditStatementState` (true only in `PendingState`), create apps/api/src/domains/credit-statement/domain/states/transferred-state.ts, and add `currency` + transfer props/getters + the new `state` branch to apps/api/src/domains/credit-statement/domain/credit-statement.aggregate.ts
- [X] T011 Add domain errors `StatementNotTransferableError` (409), `StatementNotTransferredError` (409), `TransferAlreadyBilledError` (409), `StatementPaymentCurrencyAmbiguousError` (400) in apps/api/src/domains/credit-statement/domain/errors.ts; `TransactionLinkedToStatementError` (409) in apps/api/src/domains/transaction/domain/errors.ts; `CardLimitHasDebtError` (409) in apps/api/src/domains/bank-account/domain/errors.ts
- [X] T012 [P] Write failing adapter integration tests: `findOpenForAccount(accountId, currency)` returns only that currency's open period; `findOrCreateOpenForAccount(accountId, fallback, currency)` creates at most one open period per currency and anchors `periodStart` to the MAX `closedAt` across all currencies (R2); `findOrCreateCarryOverTargetWithTx` respects currency; row ↔ aggregate mapping round-trips the new columns — in apps/api/test/integration/domains/credit-statement/infrastructure/prisma-credit-statement.repository.spec.ts
- [X] T013 Implement T012: add `currency` to `findOpenForAccount`, `findOrCreateOpenForAccount(WithTx)`, `findOrCreateCarryOverTargetWithTx`, add `listOpenForAccount(accountId)`, map the new columns, in apps/api/src/domains/credit-statement/domain/ports/credit-statement.repository.port.ts and apps/api/src/domains/credit-statement/infrastructure/prisma-credit-statement.repository.ts; update every existing caller to pass the account currency (grep `findOrCreateOpenForAccount|findOpenForAccount|findOrCreateCarryOverTargetWithTx` across apps/api/src)
- [X] T014 [P] Write failing integration tests: `netForPeriod` and `relinkToStatementWithTx` filter by `currency` and never include rows with `settlesStatementId`; `netForStatement` ignores them too — in apps/api/test/integration/domains/transaction/infrastructure/prisma-transaction-sums.repository.spec.ts
- [X] T015 Implement T014: add `currency` to `netForPeriod`/`relinkToStatementWithTx` inputs and the `settlesStatementId: null` filter in apps/api/src/domains/transaction/infrastructure/prisma-transaction-sums.repository.ts, apps/api/src/domains/transaction/infrastructure/prisma-transaction-writer.repository.ts and their ports under apps/api/src/domains/transaction/domain/ports/; add `settlesStatementId` to `createWithTx`'s plan
- [X] T016 Map `currency`, `transferredAt`, `transferredAmount`, `transferredToId` and `canTransfer` (via the contract's `canTransferStatement`) in apps/api/src/domains/credit-statement/application/statement-dto.mapper.ts; pass the account currency from every call site
- [X] T017 Run `pnpm --filter @finance/api test:unit` and `test:integration` for `credit-statement` and `transaction`: the refactor to per-currency ports must keep every existing test green (FR-019)

**Checkpoint**: foundation ready — one-currency accounts behave exactly as before.

---

## Phase 3: User Story 1 - Una facturación por moneda (Priority: P1) 🎯 MVP

**Goal**: foreign-currency charges accumulate in their own period; closing seals every currency the same day.

**Independent Test**: charge $120.000 and US$30 on one card, generate → two PENDING statements, same `closedAt`, $120.000 and US$30 (quickstart §1).

### Tests for User Story 1 ⚠️

- [X] T018 [P] [US1] Failing unit test: `CreateTransactionHandler` links a foreign-currency movement on a CREDIT_CARD account that goes through the card's own limit to the OPEN period of THAT currency (expense and manual income), and still links account-currency movements to the account-currency period, in apps/api/test/unit/domains/transaction/application/commands/create-transaction.handler.spec.ts
- [X] T019 [P] [US1] Failing unit test: `closeIfDue` closes every open period of the account with the SAME boundary (computed from the account-currency period's `periodStart`, R2), never creates an empty one, and stamps instalments only on the account-currency period, in apps/api/test/unit/domains/credit-statement/application/commands/generate-statements.handler.spec.ts
- [X] T020 [P] [US1] Failing unit test: `SyncStatementHandler` recomputes a USD period only from USD movements and never absorbs settlement rows, in apps/api/test/unit/domains/credit-statement/application/commands/sync-statement.handler.spec.ts
- [X] T021 [P] [US1] Failing unit test: `planTemplateImport` flags a foreign-currency row on a credit card account to be linked to that currency's open period (write gains `statementCurrency`), in apps/api/test/unit/domains/import/domain/template-plan.spec.ts
- [X] T022 [P] [US1] Failing integration test: two open periods (CLP + USD), `GenerateStatementsCommand` after the boundary closes both with identical `closedAt`, in apps/api/test/integration/domains/credit-statement/application/generate-statements.spec.ts

### Implementation for User Story 1

- [X] T023 [US1] Implement T018: in apps/api/src/domains/transaction/application/commands/create-transaction.handler.ts link to `findOrCreateOpenForAccount(accountId, createdAt, input.currency)` when the account is CREDIT_CARD, `input.currency !== accountCurrency` and a card own limit exists (contribution "0"); keep the existing path for the account currency (needs `AccountContext.currency`, add it in apps/api/src/domains/transaction/application/account-context.loader.ts and apps/api/src/domains/transaction/domain/movement-policy.ts)
- [X] T024 [US1] Implement T019 in apps/api/src/domains/credit-statement/application/commands/generate-statements.handler.ts (`listOpenForAccount`, one boundary, close all in one `$transaction`, one `StatementClosedEvent` per period)
- [X] T025 [US1] Implement T020 in apps/api/src/domains/credit-statement/application/commands/sync-statement.handler.ts (pass `statement.currency` to `netForPeriod`/`relinkToStatementWithTx`; pool/`creditUsed` corrections only when the statement currency is the account's)
- [X] T026 [US1] Implement T021 in apps/api/src/domains/import/domain/template-plan.ts and apps/api/src/domains/import/application/commands/import-template.handler.ts (link foreign rows via `findOrCreateOpenForAccountWithTx(tx, accountId, createdAt, currency)`)
- [X] T027 [US1] `ListCreditStatementsQueryHandler` returns every currency's periods (sorted by `periodStart` desc, then currency) with the per-currency `canTransfer`, in apps/api/src/domains/credit-statement/application/queries/list-credit-statements.handler.ts
- [X] T028 [US1] Web: group `BillingSection` by currency (account currency first) — one block per currency with its own heading ("Facturación · USD"), amounts formatted in each statement's currency, "Generar facturación" still one button for the account — in apps/web/src/domains/accounts/components/BillingSection.tsx and apps/web/src/domains/accounts/components/StatementDetailPanel.tsx; then grep apps/web/src for `"PAID"` / `"PARTIALLY_PAID"` comparisons against a statement status (installments' "ver facturación", dashboard, etc.) and replace every "is it settled" check with `accounts.isSettled`
- [X] T029 [P] [US1] Web test: `BillingSection` renders a CLP and a USD block with their own totals and never sums them, in apps/web/src/domains/accounts/components/BillingSection.test.tsx
- [X] T030 [US1] Run the US1 tests + e2e `apps/api/test/e2e/domains/bank-account/accounts.http.spec.ts`; all green

**Checkpoint**: US1 alone — USD charges have their own statement.

---

## Phase 4: User Story 2 - Pagar la facturación en dólares desde pesos (Priority: P1)

**Goal**: pay a foreign-currency statement from a CLP account with two amounts; shortfall carries in that currency.

**Independent Test**: USD statement US$30 paid from a CLP account with US$30 / $28.500 → account −$28.500, USD usage −US$30, CLP pool unchanged, statement PAID (quickstart §2–3).

### Tests for User Story 2 ⚠️

- [ ] T031 [P] [US2] Failing unit tests in apps/api/test/unit/domains/credit-statement/application/commands/pay-credit-statement.handler.spec.ts: foreign statement from a CLP account requires `chargedAmount` (`STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS`); creates an EXPENSE of `chargedAmount` in the source currency and an INCOME settlement of `amount` in the statement currency on the credit account with the card that owns that limit and `settlesStatementId`; never touches `creditUsed`; a short payment carries the rest to the OPEN period of the SAME currency; paying more USD than owed → `PAYMENT_EXCEEDS_REMAINING` (FR-010); a USD source account needs one amount
- [ ] T032 [P] [US2] Failing integration tests in apps/api/test/integration/domains/credit-statement/application/pay-credit-statement.transaction.spec.ts: the whole payment (two movements, balance, statement, carry-over, idempotency mark) commits or rolls back together; AND concurrency — 3 simultaneous payments with DIFFERENT idempotency keys against a USD statement whose remaining covers only 1: exactly one succeeds, the others get `PAYMENT_EXCEEDS_REMAINING`/`STATEMENT_ALREADY_PAID`, and the USD usage and source balance reconcile to the cent (research R5, 019 R8 precedent)
- [ ] T033 [P] [US2] Failing unit tests: `UpdateStatementPaymentHandler` on a foreign statement updates both movements (`amount`, `chargedAmount`), the source balance and the carry-over, never `creditUsed` (R13), in apps/api/test/unit/domains/credit-statement/application/commands/update-statement-payment.handler.spec.ts
- [ ] T034 [P] [US2] Failing unit tests: update/remove of a transaction with `settlesStatementId` answers `TRANSACTION_LINKED_TO_STATEMENT`, in apps/api/test/unit/domains/transaction/application/commands/update-transaction.handler.spec.ts and apps/api/test/unit/domains/transaction/application/commands/remove-transaction.handler.spec.ts
- [ ] T035 [P] [US2] Failing e2e: `POST /accounts/:id/credit-statements/:sid/pay` with `amount` + `chargedAmount` on a USD statement; without `chargedAmount` → 400; replay with the same `Idempotency-Key` → same result, no duplicate, in apps/api/test/e2e/domains/credit-statement/multi-currency-billing.http.spec.ts

### Implementation for User Story 2

- [ ] T036 [US2] Implement T031/T032 — re-read the statement with `findByIdForUpdateWithTx` INSIDE the `$transaction` and recompute `periodAmount`/remaining there before `payTowards` (both currencies) — in apps/api/src/domains/credit-statement/application/commands/pay-credit-statement.handler.ts and apps/api/src/domains/credit-statement/application/commands/pay-credit-statement.command.ts (+ controller body mapping in apps/api/src/domains/credit-statement/presentation/credit-statements.controller.ts); `payTowards` stores `settlementTransactionId` in apps/api/src/domains/credit-statement/domain/credit-statement.aggregate.ts
- [ ] T037 [US2] Implement T033 in apps/api/src/domains/credit-statement/application/commands/update-statement-payment.handler.ts
- [ ] T038 [US2] Implement T034 in apps/api/src/domains/transaction/application/commands/update-transaction.handler.ts and apps/api/src/domains/transaction/application/commands/remove-transaction.handler.ts
- [ ] T039 [US2] Web: `PayStatementPanel` shows a second amount field ("Monto debitado en <moneda origen>") when the source account currency differs from the statement's, sends `chargedAmount`, and the balance-after preview uses it; `EditStatementPaymentPanel` gains the same field for a foreign statement — in apps/web/src/domains/accounts/components/PayStatementPanel.tsx and apps/web/src/domains/accounts/components/EditStatementPaymentPanel.tsx; i18n keys in es/en
- [ ] T040 [P] [US2] Web test: paying a USD statement from a CLP account requires both amounts and sends them, in apps/web/src/domains/accounts/components/PayStatementPanel.test.tsx
- [ ] T041 [US2] Web: `TransactionDetailPanel` shows origin "Liquidación de facturación" with "Ver facturación" link and hides Editar/Eliminar for `settlesStatementId` rows, in apps/web/src/domains/transactions/components/TransactionDetailPanel.tsx
- [ ] T042 [US2] Run US2 tests + T035 e2e; all green

**Checkpoint**: US1 + US2 — USD statements can be paid from pesos.

---

## Phase 5: User Story 3 - Traspasar a pesos una facturación en dólares vencida (Priority: P2)

**Goal**: overdue foreign statement → manual transfer with the CLP amount; reversible.

**Independent Test**: overdue USD statement US$70,72 transferred with $66.052 → TRANSFERRED, USD usage −US$70,72, open CLP period and `creditUsed` +$66.052; undo restores all (quickstart §4–5).

### Tests for User Story 3 ⚠️

- [ ] T043 [P] [US3] Failing aggregate tests: `transferTowards` only from PENDING, rejects amount ≤ 0, freezes `amount`, returns what it settled (its remaining, carry-over from an earlier partial payment included), sets the five transfer fields; `transferReversal()` returns exactly the settled amount/currency and the CLP amount/currency from stored fields; `undoTransfer` only from TRANSFERRED, restores PENDING and returns that same reversal — in apps/api/test/unit/domains/credit-statement/domain/credit-statement.aggregate.spec.ts
- [ ] T044 [P] [US3] Failing unit tests for `TransferStatementHandler`: refuses when `canTransferStatement` is false (`STATEMENT_NOT_TRANSFERABLE`); creates the settlement INCOME (statement currency, owning card, `settlesStatementId`) and the CLP EXPENSE (`financeCharge: true`, no card, category `CURRENCY_TRANSFER`, linked to the OPEN account-currency period); raises `creditUsed` by the CLP amount — in apps/api/test/unit/domains/credit-statement/application/commands/transfer-statement.handler.spec.ts
- [ ] T045 [P] [US3] Failing unit tests for `UndoTransferStatementHandler`: reverts EXACTLY `statement.transferReversal()` (deletes both movements, lowers `creditUsed` by its `removedAmount`, restores the statement) — the test asserts the applied figures equal the DTO's `transferReversal`; refuses with `TRANSFER_ALREADY_BILLED` when the receiving CLP period is settled — in apps/api/test/unit/domains/credit-statement/application/commands/undo-transfer-statement.handler.spec.ts
- [ ] T046 [P] [US3] Failing integration test: transfer and undo are each atomic (forced failure after the first write rolls everything back), in apps/api/test/integration/domains/credit-statement/application/transfer-statement.transaction.spec.ts
- [ ] T047 [P] [US3] Failing unit test: the transfer's CLP charge (resolved through `CreditStatementLookupPort.transferInfoFor`) is read-only on update/remove (`TRANSACTION_LINKED_TO_STATEMENT`) and list/get overlay `transferStatementId`/`transferStatementAccountId`, in apps/api/test/unit/domains/transaction/application/commands/update-transaction.handler.spec.ts and apps/api/test/unit/domains/transaction/application/queries/list-transactions.handler.spec.ts
- [ ] T048 [P] [US3] Failing e2e: `POST .../transfer` (idempotent replay, 409 before due date, 409 for an account-currency statement) and `DELETE .../transfer` (restores; 409 once the CLP period is paid), in apps/api/test/e2e/domains/credit-statement/multi-currency-billing.http.spec.ts

### Implementation for User Story 3

- [ ] T049 [US3] Implement T043 (`transferTowards`, `transferReversal`, `undoTransfer`) in apps/api/src/domains/credit-statement/domain/credit-statement.aggregate.ts, and expose `transferReversal` (null unless TRANSFERRED) in apps/api/src/domains/credit-statement/application/statement-dto.mapper.ts + `creditStatementSchema` in packages/contracts/src/accounts/index.ts
- [ ] T050 [US3] Create apps/api/src/domains/credit-statement/application/commands/transfer-statement.command.ts and transfer-statement.handler.ts (`BaseIdempotentCommandHandler`, operation `creditStatement.transfer`, `findByIdForUpdateWithTx` inside the `$transaction`) — makes T044/T046 pass
- [ ] T051 [US3] Create apps/api/src/domains/credit-statement/application/commands/undo-transfer-statement.command.ts and undo-transfer-statement.handler.ts (operation `creditStatement.undoTransfer`; applies the reversal returned by `statement.undoTransfer()` and nothing else; needs `TransactionWriterRepositoryPort.deleteManyWithTx` if not present) — makes T045 pass
- [ ] T052 [US3] Add `transferInfoFor(transactionIds)` to apps/api/src/domains/credit-statement/domain/ports/credit-statement-lookup.port.ts and apps/api/src/domains/credit-statement/infrastructure/prisma-credit-statement.repository.ts; use it in apps/api/src/domains/transaction/application/commands/{update,remove}-transaction.handler.ts and apps/api/src/domains/transaction/application/queries/{list,get}-transaction(s).handler.ts — makes T047 pass
- [ ] T053 [US3] Wire `POST` and `DELETE /accounts/:id/credit-statements/:statementId/transfer` (`Idempotency-Key` required, `ZodParamsPipe`, `transferStatementSchema`) in apps/api/src/domains/credit-statement/presentation/credit-statements.controller.ts; register handlers in apps/api/src/domains/credit-statement/credit-statement.module.ts
- [ ] T054 [US3] Web: `accountsApi.transferStatement`/`undoTransferStatement` + `useAccountMutations.transferStatement`/`undoTransferStatement` (invalidate accounts, statements, transactions) in apps/web/src/domains/accounts/api/ and apps/web/src/domains/accounts/hooks/useAccounts.ts
- [ ] T055 [US3] Web: new apps/web/src/domains/accounts/components/TransferStatementPanel.tsx (a `FormSurface` panel: what is still owed in USD, CLP amount input, what the CLP period becomes, confirm), opened from BillingSection's "Vencida — traspasar a pesos" action shown when `statement.canTransfer`
- [ ] T056 [US3] Web: BillingSection shows TRANSFERRED as badge "Traspasada" with "US$70,72 → $66.052" and a link to the receiving CLP period, plus "Deshacer traspaso" behind a `ConfirmModal` whose text is built ONLY from `statement.transferReversal` (the same figures the handler reverts — Constitution Principle I; never recomputed in the web); `TransactionDetailPanel` origin "Traspaso de moneda" read-only with "Ver facturación" — in apps/web/src/domains/accounts/components/BillingSection.tsx and apps/web/src/domains/transactions/components/TransactionDetailPanel.tsx
- [ ] T057 [P] [US3] Web tests: transfer action only when `canTransfer`; confirming sends the CLP amount; TRANSFERRED row shows both amounts; the undo confirmation shows exactly `transferReversal`'s figures — in apps/web/src/domains/accounts/components/TransferStatementPanel.test.tsx and apps/web/src/domains/accounts/components/BillingSection.test.tsx
- [ ] T058 [US3] Run US3 tests + T048 e2e; all green

**Checkpoint**: all three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T059 [P] FR-016: failing unit test then implementation — `UpdateCardHandler` refuses to drop a `CardLimit` currency with usage > 0 or an unsettled period in it (`CARD_LIMIT_HAS_DEBT`), in apps/api/test/unit/domains/bank-account/application/commands/update-card.handler.spec.ts and apps/api/src/domains/bank-account/application/commands/update-card.handler.ts (period check through `CreditStatementLookupPort.hasUnsettledInCurrency`)
- [ ] T060 [P] Seed: a demo credit card account with a USD limit, one paid USD statement, one TRANSFERRED statement and an open USD period, in apps/api/prisma/seed.ts
- [ ] T061 SC-005 check: regenerate the reference conversion (`Finanzas Cuadra.xlsx`), import it, transfer US$70,72 → $66.052 and US$12,29 → $11.798; confirm "Crédito · USD" shows US$50,41 used (document the result in quickstart.md §8)
- [ ] T062 Run `pnpm typecheck`, `pnpm --filter @finance/api test:unit`, `test:integration`, `test:e2e` (credit-statement, transaction, bank-account, import), `pnpm --filter @finance/web test` (accounts, transactions, i18n), `pnpm --filter @finance/contracts test`, `pnpm check:boundaries`, `pnpm exec prettier --check` on touched files
- [ ] T063 Memory sync: constitution amendment (PATCH bump, Sync Impact Report for the new columns/endpoints/state) in .specify/memory/constitution.md and a `credit-statement` amendment + "Current plan" update in CLAUDE.md

---

## Dependencies & Execution Order

- **Setup (T001–T004)** → **Foundational (T005–T017)** → user stories.
- **US1 (T018–T030)** depends only on Foundational. **MVP.**
- **US2 (T031–T042)** depends on Foundational; uses US1's per-currency periods to have something to pay (for a standalone test, seed a closed USD statement directly).
- **US3 (T043–T058)** depends on Foundational and reuses US2's settlement movement (`settlesStatementId` write path) — do after US2.
- **Polish (T059–T063)** after the stories it touches.
- Within each story: tests → aggregate/domain → handlers → controller → web.

## Parallel Opportunities

- Setup: T004 alongside T001–T003.
- Foundational: T005, T007, T009, T012, T014 (tests in different files) together; then their implementations.
- US1: T018–T022 together; T029 alongside T028.
- US2: T031–T035 together; T040 alongside T039.
- US3: T043–T048 together; T057 alongside T055/T056.
- Polish: T059 and T060 together.

```text
# US1 tests in parallel
T018 create-transaction.handler.spec.ts
T019 generate-statements.handler.spec.ts
T020 sync-statement.handler.spec.ts
T021 template-plan.spec.ts
T022 generate-statements.spec.ts (integration)
```

## Implementation Strategy

1. **MVP = Setup + Foundational + US1**: USD charges get their own statement; nothing else changes. Validate quickstart §1.
2. **+ US2**: pay USD statements from pesos. Validate §2–3.
3. **+ US3**: overdue transfer + undo. Validate §4–5.
4. **Polish**: limit guard, seed, SC-005 with the real Excel, full gates, memory sync.

# Tasks: Facturación de compras en cuotas con tarjeta de crédito

**Feature**: 014-installment-credit-billing | **Date**: 2026-08-22
**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/installments.md](./contracts/installments.md), [quickstart.md](./quickstart.md)

**Tests are MANDATORY** — Constitution IV (Test-First / TDD) is non-negotiable in this
repo. Every implementation task is preceded by the failing test that defines it.

**Scoped test runs only.** The repo has 500+ tests; a full run blocks. Each task names the
filter to use.

---

## Phase 1: Setup

- [x] T001 Create the feature branch `014-installment-credit-billing` from **`013-installments-redesign`, NOT from `main`**: 013 is not merged yet, and 014 builds directly on its columns and handlers (`InstallmentPayment.paidAmount`/`carriedOverAmount`/`transactionId`, `PayInstallmentHandler`). Branching from `main` would drop that base
- [x] T002 Confirm the API boots and the existing suites are green before touching anything: `pnpm --filter @finance/api test:unit` and `pnpm --filter @finance/contracts test`

---

## Phase 2: Foundational (BLOCKING — every user story depends on these)

**Purpose**: the module-graph prerequisite, the schema column, and the contract shapes.
Nothing in Phase 3+ can start until this phase is complete.

### The Constitution VI prerequisite (research.md R3)

- [x] T003 Create `apps/api/src/domains/installment-plan/installment-plan.data.module.ts` exporting ONLY the `INSTALLMENT_PLAN_REPOSITORY` → `PrismaInstallmentPlanRepository` binding, importing only `InstallmentPaymentDataModule`
- [x] T004 Rewrite `apps/api/src/domains/installment-plan/installment-plan.module.ts` to import the new leaf instead of declaring the binding itself, leaving handlers/controller untouched
- [x] T005 Verify the graph stays acyclic with `pnpm check:boundaries` and that the API still boots (`pnpm --filter @finance/api dev`, then stop)

### Schema

- [x] T006 Add `creditStatementId String?` + relation to `CreditStatement` (`onDelete: SetNull`) and `@@index([creditStatementId])` on `InstallmentPayment` in `apps/api/prisma/schema.prisma`, plus the inverse relation field on `CreditStatement`
- [x] T007 Run `pnpm db:push` and `pnpm --filter @finance/api exec prisma generate`; confirm the column exists and no other table changed

### Contracts (test-first)

- [x] T008 [P] Write failing tests for `installmentStatus()` in `packages/contracts/src/installments/installments.test.ts` covering PAID-wins-over-BILLED ordering, BILLED, SCHEDULED
- [x] T009 [P] Write failing tests asserting the three plan counters always sum to `installmentCount`, and that a non-credit-card plan always has `billedCount === 0` and `billingWarning === null` (the FR-005 regression guard)
- [x] T010 Add `installmentPaymentStatus` enum, `installmentStatus()`, `planBillingWarning` enum, and the `creditStatementId`/`status`/`scheduledCount`/`billedCount`/`paidCount`/`billingWarning` fields to `packages/contracts/src/installments/index.ts` until T008–T009 pass
- [x] T011 [P] ~~Add error codes to the contracts' error vocabulary~~ — **N/A, mis-scoped when this task was written**: `packages/contracts/src/common/errors.ts` types `code` as a free `z.string()`; there is no enumerated vocabulary. Error codes live in the API domain's `errors.ts` (T013) and in the i18n catalogs (T012). Introducing an enum now would touch all 23 domains — out of scope
- [x] T012 [P] Add `errors.INSTALLMENT_PLAN_BILLED`, `errors.INSTALLMENT_PLAN_SETTLED`, the three instalment statuses and the two billing warnings to BOTH `apps/web/src/i18n/es.json` and `apps/web/src/i18n/en.json`; confirm with `pnpm --filter @finance/web test -- parity`
- [x] T013 Add the two error classes to `apps/api/src/domains/installment-plan/domain/errors.ts` (409, following the existing shape)

**Checkpoint**: schema and contracts land; nothing behaves differently yet.

---

## Phase 3: User Story 1 — El cupo refleja la deuda comprometida (P1)

**Goal**: registering a credit-card plan drops the pool by the full purchase amount, and
that movement never bills in a period.

**Independent test**: create a plan with a credit card, observe the account's available
credit before and after (quickstart §A). Delivers value alone.

### Tests first

- [x] T014 [P] [US1] Write a failing unit test in `apps/api/test/unit/domains/installment-plan/create-plan.spec.ts`: creating a plan with a CREDIT card produces a purchase movement for `totalPrincipal`, carrying `cardId` and `installmentPlanId`, dated `startDate`
- [x] T015 [P] [US1] Write a failing unit test: creating a plan with a DEBIT card, a PREPAID card, or no card produces NO purchase movement and moves no pool (FR-005 guard)
- [x] T016 [P] [US1] Write a failing unit test: a plan with interest produces BOTH the purchase movement and the existing `financeCharge` movement, the latter WITHOUT `installmentPlanId`, with no double counting (FR-004, research.md R4)
- [x] T017 [P] [US1] Write a failing unit test: the purchase movement moves no cash balance on any account (FR-002a)
- [x] T018 [P] [US1] Write a failing integration test in `apps/api/test/integration/domains/transaction/statement-sums.spec.ts`: `sumLinkedTransactions` and `netForPeriod` EXCLUDE transactions carrying `installmentPlanId` (FR-007 — the highest-risk item in plan.md §Risks)

### Implementation

- [x] T019 [US1] Extend `CreateInstallmentPlanHandler` in `apps/api/src/domains/installment-plan/application/commands/create-installment-plan.handler.ts` to emit the purchase movement for CREDIT-card plans, in the same `$transaction` as the plan write and alongside the existing `recordFinanceCharge`
- [x] T020 [US1] Exclude `installmentPlanId`-carrying rows from `sumLinkedTransactions` and `netForPeriod` in `apps/api/src/domains/transaction/infrastructure/prisma-transaction-sums.repository.ts`, documenting WHY in a comment
- [x] T021 [US1] Confirm `planDeletionReversal` classifies the purchase movement as a credit reversal, not a cash restoration (research.md R5) — add a unit case in `apps/api/test/unit/domains/installment-plan/plan-deletion.spec.ts` rather than changing the function if it already does
- [x] T022 [US1] Run `pnpm --filter @finance/api test:unit` and `test:integration`; then walk quickstart §A and §A2 by hand

**Checkpoint**: US1 shippable. The pool stops lying.

---

## Phase 4: User Story 2 — Cada facturación cobra las cuotas que vencieron (P1)

**Goal**: closing a period charges the instalments due in it, exactly once, gap-proof.

**Independent test**: close successive periods and check each one's amount and breakdown
(quickstart §B).

**Depends on**: Phase 3 (nothing to bill without a plan whose purchase is recorded).

### Tests first

- [x] T023 [P] [US2] Write a failing unit test in `apps/api/test/unit/domains/installment-plan/installment-billing.spec.ts` for the pure selection function: picks due + unbilled, skips already-billed, skips other accounts' cards, skips currency mismatches (FR-008, FR-009, FR-009a)
- [x] T024 [P] [US2] Write a failing unit test for the closing-instant boundary (FR-013b) and for idempotency — running selection twice over the same close yields nothing the second time (FR-013a)
- [x] T025 [P] [US2] Write a failing unit test for `CreditStatement.totalFor(linked, instalments)` = linked + carriedOver + instalments (FR-010)
- [x] T026 [P] [US2] Write a failing integration test in `apps/api/test/integration/domains/credit-statement/generate.spec.ts` for **the gap case**: a cycle passes with no card activity, so no period is generated; the next close charges the gap's instalment exactly once (FR-009 — this is what justifies the column)
- [x] T027 [P] [US2] Write a failing integration test: the close→stamp write is atomic — a forced failure after closing leaves neither the period closed nor the instalments stamped
- [x] T028 [P] [US2] Write a failing integration test: after the last instalment is billed, further closes charge nothing from that plan (FR-013)
- [x] T029 [P] [US2] Write a failing integration test: `sync` on a period that charged instalments preserves them (FR-012)

### Implementation

- [x] T030 [US2] Create `apps/api/src/domains/installment-plan/domain/installment-billing.ts` — the pure selection function over rows, using only `@finance/money`, with no I/O
- [x] T031 [US2] Add `listBillableForAccount` and `stampStatementWithTx` to `apps/api/src/domains/installment-payment/domain/ports/installment-payment.repository.port.ts` and implement them in `prisma-installment-payment.repository.ts`
- [x] T032 [US2] Change `CreditStatement.totalFor` in `apps/api/src/domains/credit-statement/domain/credit-statement.aggregate.ts` to take the instalment summand explicitly (research.md R1), updating every call site
- [x] T033 [US2] Add the instalment sum + count to `PrismaCreditStatementRepository`, aggregated in Postgres (never by loading rows), in `apps/api/src/domains/credit-statement/infrastructure/prisma-credit-statement.repository.ts`
- [x] T034 [US2] Extend `closeIfDue` in `apps/api/src/domains/credit-statement/application/commands/generate-statements.handler.ts` to stamp the period's billable instalments inside the same `$transaction` as the close
- [x] T035 [US2] Import `InstallmentPlanDataModule` in `apps/api/src/domains/credit-statement/credit-statement.module.ts` (the leaf from T003) and re-run `pnpm check:boundaries`
- [x] T036 [US2] Recompose the statement breakdown **in `credit-statement`, never in `transaction`** (Constitution VI): `PrismaCreditStatementRepository.breakdown` asks `TransactionSumsRepositoryPort` for the linked-expense sum (→ `purchases`) and the `installment-payment` port for the stamped instalments (→ `installments`, `installmentCount`), then combines them. Two disjoint sources, not a remainder (data-model.md §Breakdown)
- [x] T036a [US2] Reduce `PrismaTransactionSumsRepository.breakdownForStatement` to returning ONLY the linked-expense sum — or delete it if `sumLinkedTransactions` already answers that. `transaction`'s adapter MUST NOT query `installment-payment`'s table: that adapter is the one place the old unreachable-bucket logic lived, and leaving it composing both sources is the Constitution VI violation this feature must not introduce. Verify with `pnpm check:boundaries` and by grepping that adapter for `installmentPayment`
- [x] T037 [US2] Teach `SyncStatementHandler` to preserve stamped instalments while recomputing from movements (FR-012)
- [x] T038 [US2] Run the API suites; walk quickstart §B, §B2, §B3, §B4

**Checkpoint**: US2 shippable. Statements charge what the issuer charges.

---

## Phase 5: User Story 3 — Pagar la facturación salda las cuotas (P1)

**Goal**: settling a period — in full or short — settles its instalments, and the pool
moves exactly once.

**Independent test**: pay a period containing an instalment and check the plan
(quickstart §C).

**Depends on**: Phase 4 (nothing to settle without stamped instalments).

### Tests first

- [x] T039 [P] [US3] Write a failing unit test: settling a period stamps `paidAt` on all its instalments, with `paidAmount` = the instalment's own scheduled amount and `carriedOverAmount` = "0" (FR-014, research.md R6)
- [x] T040 [P] [US3] Write a failing unit test for the SHORT payment: instalments still settle, and the shortfall exists ONLY as the successor period's carry-over — never also on the instalment (FR-015, Constitution I)
- [x] T041 [P] [US3] Write a failing unit test asserting "settled" is decided by the fact of payment, not by a status name (FR-014a — the trap the repo already hit once)
- [x] T042 [P] [US3] Write a failing integration test: paying a period of 130.000 (90.000 instalment + 40.000 purchase) raises available credit by exactly 130.000, not 220.000 (FR-016 — the double-discount guard)
- [x] T043 [P] [US3] Write a failing integration test: correcting a settled period's payment leaves its instalments' status untouched (FR-017)
- [x] T044 [P] [US3] Write a failing e2e test in `apps/api/test/e2e/domains/installment-plan/installment-billing.http.spec.ts` for **SC-003**: the whole life of a 12-instalment plan — create, close and pay 12 periods (with at least one empty cycle in the middle), asserting the sum billed equals the plan's commitment, nothing twice, nothing missed

### Implementation

- [x] T045 [US3] Add `settleForStatementWithTx` to the `installment-payment` port and its adapter
- [x] T046 [US3] Extend `PayCreditStatementHandler` in `apps/api/src/domains/credit-statement/application/commands/pay-credit-statement.handler.ts` to settle the period's instalments inside its existing cross-aggregate `$transaction`
- [x] T047 [US3] Confirm `UpdateStatementPaymentHandler` does not touch instalment state (FR-017), adding a guard only if T043 shows it does
- [x] T048 [US3] Run the API suites including `test:e2e`; walk quickstart §C, §C2, §C3

**Checkpoint**: US3 shippable. The cycle closes; SC-003 is proven.

---

## Phase 6: Invariants & integrity (FR-006a, FR-006b, FR-022a, FR-024)

**Depends on**: Phase 5. Can run in parallel with Phase 7.

### Tests first

- [x] T049 [P] Write a failing unit test: editing `totalPrincipal`, `installmentCount`, `startDate` or `cardId` after the first instalment is billed throws `INSTALLMENT_PLAN_BILLED`; title/category/notes still save (FR-006b)
- [x] T050 [P] Write a failing unit test: deleting a plan with an instalment on a SETTLED period throws `INSTALLMENT_PLAN_SETTLED`; deleting one whose periods are merely PENDING succeeds (FR-006a)
- [x] T051 [P] Write a failing unit test: `POST /installments/:id/payments/:seq/pay` on a CREDIT-card plan is refused server-side (FR-022a)
- [x] T052 [P] Write a failing integration test: editing or deleting a plan's purchase movement from the Movements view answers `TRANSACTION_LINKED_TO_INSTALLMENT` (FR-024)
- [x] T053 [P] Write a failing integration test in `apps/api/test/integration/domains/installment-plan/plan-deletion.spec.ts` for the DELETION HAPPY PATH (FR-006): deleting a credit-card plan whose periods are all still PENDING removes its purchase movement, releases exactly the pool it consumed (principal + any finance charge), and leaves the account's cash balance untouched. Assert in the SAME test that the impact declared beforehand by `planDeletionReversal` equals what was applied — the two must come from one function, per Constitution I's irreversible-impact rule. Without this, only the refusal (T050) is covered and the reversal itself is untested

### Implementation

- [x] T054 Add the billed/settled invariants to `apps/api/src/domains/installment-plan/domain/installment-plan.aggregate.ts` (`applyUpdate` freeze + a deletion guard), so no code path can bypass them
- [x] T055 Enforce the deletion refusal in `apps/api/src/domains/installment-plan/application/commands/remove-installment-plan.handler.ts` before `planDeletionReversal` runs
- [x] T056 Refuse per-instalment pay/unpay for CREDIT-card plans in `pay-installment.handler.ts` and `unpay-installment.handler.ts`, reusing `INSTALLMENT_CARD_IS_CREDIT`
- [x] T057 Widen `InstallmentPaymentLookupPort.isLinkedToPayment` (or add a sibling question) in `apps/api/src/domains/installment-payment/domain/ports/installment-payment-lookup.port.ts` so a transaction carrying `installmentPlanId` also matches, and update its adapter + the two `transaction` handlers that call it
- [x] T058 Run the API suites; walk quickstart §E

---

## Phase 7: User Story 4 — Ver en qué va cada plan (P2)

**Goal**: the three counters are visible without opening the detail, the pay action is gone
for credit-card plans, and a short-settled instalment says so.

**Independent test**: a plan with instalments in all three states (quickstart §D).

**Depends on**: Phase 5.

### Tests first

- [x] T059 [P] [US4] Write a failing test in `apps/web/src/domains/installments/lib/installmentMetrics.test.ts` for deriving the three counters and the billing warning
- [x] T060 [P] [US4] Write a failing test in `apps/web/src/domains/installments/components/InstallmentDetailPanel.test.tsx`: a CREDIT-card plan renders no pay action and shows the explanation; a debit-card plan still renders it (the FR-005/FR-022 regression guard)
- [x] T061 [P] [US4] Write a failing test: an instalment settled by a partially-paid period shows the short-settlement wording and a link to the period, not a flat "pagada" (FR-020)

### Implementation

- [x] T062 [US4] Add the counters, per-instalment status and `billingWarning` to `apps/api/src/domains/installment-plan/application/plan-dto.mapper.ts`, shared by the list and detail queries so the two can never disagree
- [x] T063 [P] [US4] Show the three counters per plan in `apps/web/src/domains/installments/components/InstallmentPlanTable.tsx` and `InstallmentPlanList.tsx`
- [x] T064 [P] [US4] Gate the pay action and add the explanation in `apps/web/src/domains/installments/components/InstallmentDetailPanel.tsx`, driven by the contract's `generatesMovementOnPay`
- [x] T065 [P] [US4] Render the BILLED state distinctly from overdue and from paid in the detail's instalment rows
- [x] T066 [P] [US4] Render the short-settlement wording + link to the settling period (FR-020), reusing `BillingSection`'s "pagado X de Y" spirit
- [x] T067 [P] [US4] Render the billing warnings (no billing day, currency mismatch, deleted card) with a link to the remedy where one exists (FR-023a)
- [x] T068 [US4] Add `ImmutableFieldsNotice` coverage for the newly frozen fields in `apps/web/src/domains/installments/components/InstallmentFormPanel.tsx` (FR-006b)
- [x] T069 [US4] Show the real instalment figures in `apps/web/src/domains/accounts/components/BillingSection.tsx` breakdown (FR-011)
- [x] T070 [US4] Run `pnpm --filter @finance/web test`; walk quickstart §D and §F

---

## Phase 8: Polish & memory sync

- [X] T071 [P] Rewrite the credit-card instalment plan in `apps/api/prisma/seed.ts`: a plan with its purchase movement, several billed instalments, and at least one period **settled with a shortfall** (the FR-020 display case)
- [X] T072 [P] Add a seeded plan with a DEBIT card that still pays instalment-by-instalment, so the two behaviors are both visible in a fresh database
- [X] T073 Run `pnpm db:push && pnpm db:seed` and walk the full quickstart end to end
- [X] T074 [P] Run the full gate: `pnpm typecheck`, `pnpm check:boundaries`, `turbo run lint`, `pnpm format:check`
- [x] T075 **[Constitution V — mandatory]** Update `CLAUDE.md`: the new column, the statement-total rule (movements + carry-over + instalments), the purchase-movement role and its exclusion, the two error codes, the `installment-plan.data.module.ts` leaf, and the two-level carry-over note (FR-025)
- [x] T076 **[Constitution V — mandatory]** Amend `.specify/memory/constitution.md` with a Sync Impact Report and a MINOR version bump: the carry-over rule now explicitly spans two levels (period-to-period for credit-card plans, instalment-to-instalment otherwise), which sharpens Principle I rather than replacing it
- [x] T077 Update `docs/{english,spanish}/BANKING_LOGIC.md` with how a credit-card instalment plan flows through pool and statement
- [x] T078 Remove from `docs/PENDING.md` anything this feature closes (the unreachable `installments` breakdown bucket)

---

## Dependencies

```
Phase 1 (Setup)
   └─▶ Phase 2 (Foundational) ── BLOCKING
          └─▶ Phase 3 (US1: purchase movement + pool)   ── P1, MVP
                 └─▶ Phase 4 (US2: stamping at close)    ── P1
                        └─▶ Phase 5 (US3: settling)      ── P1
                               ├─▶ Phase 6 (invariants)  ┐ parallel
                               └─▶ Phase 7 (US4: web)    ┘
                                      └─▶ Phase 8 (polish + memory)
```

The three P1 stories are **strictly sequential** — unusual for this template, and
deliberate: Phase 4 has nothing to bill without Phase 3's plan, and Phase 5 has nothing to
settle without Phase 4's stamps. Phases 6 and 7 are independent of each other.

## Parallel opportunities

| Phase | Parallel tasks         | Why safe                                             |
| ----- | ---------------------- | ---------------------------------------------------- |
| 2     | T008, T009, T011, T012 | different files; contracts + i18n                    |
| 3     | T014–T018              | five separate test files                             |
| 4     | T023–T029              | separate test files, no shared fixture writes        |
| 5     | T039–T044              | separate test files                                  |
| 6     | T049–T053              | separate test files                                  |
| 7     | T063–T067              | different components; T062 (the DTO) must land first |
| 8     | T071, T072, T074       | seed edits vs. gate commands                         |

## Implementation strategy

**MVP = Phase 1 + 2 + 3.** That alone fixes the defect with real financial consequence:
the app stops showing available credit the issuer does not recognise. It ships without
Phases 4–7 and leaves everything else exactly as it is today.

**Incremental delivery**: each of Phases 3, 4, 5 is independently demonstrable, in that
order. Phase 7 (the visible part) deliberately comes last, because there is nothing
truthful to display until the states exist.

**Do not skip Phase 2's T003–T005.** Starting Phase 4 without the leaf module forces
`credit-statement` to import `installment-plan`'s orchestration module, which is the
Constitution VI violation the whole layering exists to prevent — and it is far more
expensive to unwind later.

## Format validation

All 79 tasks carry: `- [ ]` checkbox, sequential ID, `[P]` where parallelisable, `[USn]`
on user-story phases only (Setup/Foundational/Polish carry none, per the template), and an
explicit file path or command.

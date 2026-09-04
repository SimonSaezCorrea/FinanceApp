---
description: "Task list for Unified Row Identifiers"
---

# Tasks: Unified Row Identifiers

**Input**: Design documents from `/specs/016-unified-row-ids/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/id-validation.md, quickstart.md

**Tests**: Included — this is money/identity-critical backend infrastructure (constitution Principle VIII), and SC-002/SC-003/SC-004 explicitly require automated verification.

**Organization**: Tasks are grouped by user story (US1 = validation at the edge, US2 = unified generation, US3 = doc/quickstart truthfulness) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Monorepo per plan.md: `apps/api/src/`, `apps/api/test/{unit,integration,e2e}/`, `apps/api/prisma/`,
`packages/contracts/src/`, `apps/web/src/i18n/`.

---

## Phase 1: Setup

**Purpose**: Add the one new dependency this feature needs.

- [x] T001 Add `uuid` as a dependency of `apps/api` in `apps/api/package.json`, using this repo's existing caret-range convention (e.g. `"uuid": "^11.x"`, matching how `prisma`/`zod` are already pinned), then run `pnpm install`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema-wide id-format switch and the two primitives (validation schema,
generation helper) both stories build on. Nothing in US1 or US2 can be meaningfully tested until
the schema itself generates UUID v7 ids.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Create `packages/contracts/src/common/row-id.ts` exporting `rowId = z.uuidv7().meta({ errorCode: "INVALID_ID_FORMAT" })` (per research.md Decision 3-4); export it from `packages/contracts/src/common/index.ts` (or create one if it doesn't exist) and re-export from `packages/contracts/src/index.ts`
- [x] T003 [P] Create `apps/api/src/infra/id/generate-row-id.ts` exporting a single `generateRowId(): string` wrapping the `uuid` package's `v7()` export (research.md Decision 2)
- [x] T004 In `apps/api/prisma/schema.prisma`, change every `id String @id @default(cuid())` (24 models) to `id String @id @default(uuid(7))` — a single sweep, no other column touched
- [x] T005 Run `pnpm db:reset` (or `pnpm db:push && pnpm db:seed`) to regenerate dev data under the new default; spot-check per quickstart.md §1 that seeded ids are UUID v7

**Checkpoint**: Schema generates UUID v7 by default; `rowId` and `generateRowId()` exist and are importable. US1 and US2 can now proceed in parallel.

---

## Phase 3: User Story 1 - A malformed identifier is rejected at the edge (Priority: P1) 🎯 MVP

**Goal**: Every path param and body field that references a row rejects a non-UUID-v7 value with
`400 INVALID_ID_FORMAT` before any database query, without disturbing any other validation
behavior.

**Independent Test**: Send a malformed id (empty, wrong length, invalid chars, or a well-formed
v4 UUID) in a path param or a referencing body field on any endpoint; confirm rejection with the
shared code before any Prisma call — per quickstart.md §3.

### Tests for User Story 1

- [x] T006 [P] [US1] Unit test for the `rowId` schema (accepts a v7 UUID, rejects a v4 UUID, rejects empty/malformed strings) in `packages/contracts/test/common/row-id.test.ts` (create the `test/` dir if the package doesn't have one yet, mirroring its existing test layout)
- [x] T007 [P] [US1] Unit test for `ZodParamsPipe`'s new `INVALID_ID_FORMAT` mapping (a `rowId`-backed param fails → `code: "INVALID_ID_FORMAT"`, `field` set; a non-`rowId` param failure still yields the existing generic code) in `apps/api/test/unit/infra/http/zod-params.pipe.test.ts`
- [x] T008 [P] [US1] Unit test for `ZodValidationPipe`'s equivalent mapping on a body field in `apps/api/test/unit/infra/http/zod-validation.pipe.test.ts`
- [x] T009 [P] [US1] E2E test: `GET /accounts/:id` with a malformed id and with a well-formed v4 UUID both return `400 INVALID_ID_FORMAT` before touching the database, in `apps/api/test/e2e/bank-account/accounts.e2e.test.ts` (extend the existing suite)
- [x] T010 [P] [US1] E2E test: `POST /transactions` with a malformed `bankAccountId` body field returns `400 INVALID_ID_FORMAT` with `field: "bankAccountId"`, in `apps/api/test/e2e/transaction/transactions.e2e.test.ts` (extend the existing suite)
- [x] T011 [P] [US1] E2E test: `GET /transactions/summary` still resolves to the summary handler (not misread as `:id`) after `rowId` validation is wired in, in `apps/api/test/e2e/transaction/transactions.e2e.test.ts` (Acceptance Scenario 3 / FR-005 — a regression guard, not new routing behavior)
- [x] T011a [P] [US1] E2E test: `GET /debts/:id` and `POST /installments` (malformed `paymentAccountId`) both return `400 INVALID_ID_FORMAT`, in `apps/api/test/e2e/debt/debts.e2e.test.ts` and `apps/api/test/e2e/installment-plan/installments.e2e.test.ts` (extend existing — broadens SC-002's "per endpoint group" evidence beyond accounts/transactions to two more domain groups)

> **SC-002 coverage note**: the `INVALID_ID_FORMAT` mapping is implemented once, centrally, in the two shared pipes (T012, T013) — T007/T008 test that mechanism directly, so every one of the ~25 endpoint files inherits identical behavior by construction, not by per-file duplication. T009-T011a spot-check 4 concrete domain groups (accounts, transactions, debts, installments) as end-to-end evidence; this is treated as sufficient given the centralized mechanism, rather than writing one e2e test per remaining domain group.

### Implementation for User Story 1

- [x] T012 [US1] Extend `apps/api/src/infra/http/zod-params.pipe.ts` to detect a failing issue whose schema carries `meta().errorCode` and throw that code (with `field`) instead of the generic `VALIDATION_FAILED`, preserving existing behavior for every other failure (research.md Decision 4)
- [x] T013 [US1] Apply the identical detection to `apps/api/src/infra/http/zod-validation.pipe.ts` (body/query)
- [x] T014 [P] [US1] Switch the `id`-shaped field(s) in `apps/api/src/domains/bank-account/presentation/dto/account-id.params.ts` and `card.params.ts` to `rowId`
- [x] T015 [P] [US1] Switch `apps/api/src/domains/credit-statement/presentation/dto/statement.params.ts` (`id`, `statementId`) to `rowId`
- [x] T016 [P] [US1] Switch `apps/api/src/domains/debt/presentation/dto/debt-id.params.ts` to `rowId`
- [x] T017 [P] [US1] Switch `apps/api/src/domains/installment-plan/presentation/dto/installment-payment.params.ts`'s `id` field to `rowId` (leave `seq` as `z.coerce.number().int().positive()`, unchanged) and `installment-plan-id.params.ts` to `rowId`
- [x] T018 [P] [US1] Switch `apps/api/src/domains/investment/presentation/dto/investment-id.params.ts` to `rowId`
- [x] T019 [P] [US1] Switch `apps/api/src/domains/recurring-expense/presentation/dto/recurring-id.params.ts` to `rowId`
- [x] T020 [P] [US1] Switch `apps/api/src/domains/savings-goal/presentation/dto/savings-entry-id.params.ts` and `savings-goal-id.params.ts` to `rowId`
- [x] T021 [P] [US1] Switch `apps/api/src/domains/transaction/presentation/dto/transaction-id.params.ts` and `transfer-group.params.ts` (`groupId`) to `rowId`
- [x] T022 [P] [US1] Switch `apps/api/src/domains/wallet-item-dashboard/presentation/dto/wallet-item-id.params.ts` to `rowId`
- [x] T023 [P] [US1] Switch every id-shaped field (e.g. `bankAccountId`, `cardId`, `institutionId`, `countryId`) in `packages/contracts/src/accounts/index.ts` to `rowId` — do NOT touch `accountNumber`, `accountAlias`, or `code` (business identifiers, FR-006, out of scope)
- [x] T024 [P] [US1] Switch id-shaped fields in `packages/contracts/src/auth/index.ts` to `rowId`
- [x] T025 [P] [US1] Switch id-shaped fields in `packages/contracts/src/debts/index.ts` to `rowId`
- [x] T026 [P] [US1] Switch id-shaped fields in `packages/contracts/src/import/index.ts` to `rowId`
- [x] T027 [P] [US1] Switch id-shaped fields (`paymentAccountId`, `cardId`, etc.) in `packages/contracts/src/installments/index.ts` to `rowId`
- [x] T028 [P] [US1] Switch id-shaped fields (`bankAccountId`) in `packages/contracts/src/investments/index.ts` to `rowId`
- [x] T029 [P] [US1] Switch id-shaped fields (`bankAccountId`) in `packages/contracts/src/recurring/index.ts` to `rowId`
- [x] T030 [P] [US1] Switch id-shaped fields (`institutionId`, `countryId`) in `packages/contracts/src/reference/index.ts` to `rowId` — do NOT touch `code` (institution/CMF code), `rut`-prefixed catalogue keys, CBU/alias fields, or ISO country/currency codes (business identifiers, FR-006, out of scope)
- [x] T031 [P] [US1] Switch id-shaped fields (`savingsGoalId`) in `packages/contracts/src/savings/index.ts` to `rowId`
- [x] T032 [P] [US1] Switch id-shaped fields in `packages/contracts/src/transactions/index.ts` and `packages/contracts/src/transactions/attachments.ts` to `rowId`
- [x] T033 [P] [US1] Switch id-shaped fields (`accountId`/`cardId`) in `packages/contracts/src/wallet/index.ts` to `rowId`
- [x] T034 [US1] Add `errors.INVALID_ID_FORMAT` (es + en) to `apps/web/src/i18n/es.json` and `apps/web/src/i18n/en.json`, matching the existing error-code-to-copy convention (`src/i18n/parity.test.ts` must still pass)

**Checkpoint**: Every path param and body field referencing a row rejects a malformed/wrong-version id with `400 INVALID_ID_FORMAT`; existing valid requests are unaffected.

---

## Phase 4: User Story 2 - Every new row gets an identifier in the same format (Priority: P2)

**Goal**: The five write paths that mint their own id produce UUID v7, identical in format to the
schema default — no code path mints a different format.

**Independent Test**: Trigger each of the five write paths plus an ordinary create on any other
domain; confirm every resulting id is UUID v7 — per quickstart.md §2.

### Tests for User Story 2

- [x] T035 [P] [US2] Unit test for `generateRowId()` (returns a string matching the UUID v7 shape) in `apps/api/test/unit/infra/id/generate-row-id.test.ts`
- [x] T036 [P] [US2] Integration test: paying a credit statement produces a payment transaction whose id is UUID v7, in `apps/api/test/integration/credit-statement/pay-credit-statement.integration.test.ts` (extend existing)
- [x] T037 [P] [US2] Integration test: paying an installment produces a transaction id that is UUID v7, in `apps/api/test/integration/installment-plan/pay-installment.integration.test.ts` (extend existing)
- [x] T038 [P] [US2] Integration test: creating an installment plan produces a plan id and, for a CREDIT card, a purchase-transaction id that are both UUID v7, in `apps/api/test/integration/installment-plan/create-installment-plan.integration.test.ts` (extend existing)
- [x] T039 [P] [US2] Integration test: creating a transfer produces a `transferGroupId` that is UUID v7, in `apps/api/test/integration/transaction/create-transfer.integration.test.ts` (extend existing)
- [x] T040 [P] [US2] Integration test: uploading an attachment produces an `attachmentId` that is UUID v7, in `apps/api/test/integration/transaction-attachment/upload-attachment.integration.test.ts` (extend existing; skip/guard as the suite already does when object storage isn't configured)

### Implementation for User Story 2

- [x] T041 [P] [US2] Replace `randomUUID()` with `generateRowId()` in `apps/api/src/domains/credit-statement/application/commands/pay-credit-statement.handler.ts:126`
- [x] T042 [P] [US2] Replace `randomUUID()` with `generateRowId()` in `apps/api/src/domains/installment-plan/application/commands/pay-installment.handler.ts:126`
- [x] T043 [P] [US2] Replace `randomUUID()` with `generateRowId()` in `apps/api/src/domains/installment-plan/application/commands/create-installment-plan.handler.ts:196`
- [x] T044 [P] [US2] Replace `randomUUID()` with `generateRowId()` in `apps/api/src/domains/transaction/application/commands/create-transfer.handler.ts:65`
- [x] T045 [P] [US2] Replace `randomUUID()` with `generateRowId()` in `apps/api/src/domains/transaction-attachment/application/commands/upload-attachment.handler.ts:61`
- [x] T046 [US2] Grep the rest of `apps/api/src` for any remaining `randomUUID(` call (there should be none left outside test files) to confirm no sixth site was missed

**Checkpoint**: All 24 tables' schema defaults and all known application-minted ids produce the identical UUID v7 format — SC-001 holds.

---

## Phase 5: User Story 3 - The project's own claim about id validation is actually true (Priority: P3)

**Goal**: specs/009's SC-007 quickstart check exercises real rejection behavior instead of passing
trivially.

**Independent Test**: Re-run the updated SC-007 check against pre-feature behavior (fails) and
post-feature behavior (passes) — per quickstart.md §5.

### Implementation for User Story 3

- [x] T047 [US3] Rewrite `## 8. Path params are Zod-validated (SC-007)` in `specs/009-ddd-cqrs-architecture/quickstart.md` to describe the concrete check (malformed `:id` → `400 INVALID_ID_FORMAT` before any repository call), replacing the current aspirational wording (research.md Decision 6)

**Checkpoint**: specs/009's own acceptance criterion is a real, re-runnable check.

---

## Phase 5b: User Story 4 - A body-supplied FK is verified as the caller's own before it is saved (Priority: P4, added 2026-09-04)

**Goal**: The five write paths that accept a body-supplied `bankAccountId`/`paymentAccountId`/
`cardId` referencing another row reject a well-formed but foreign one, before persisting.

**Independent Test**: As user B, obtain the id of user A's account/card; as user A, submit it to
each of the five write paths; confirm each is rejected not-found.

- [x] T052 [P] [US4] Create `apps/api/src/domains/bank-account/domain/ports/bank-account-lookup.port.ts` (`BankAccountLookupPort.accountOwned(userId, accountId): Promise<boolean>`) + `infrastructure/prisma-bank-account-lookup.repository.ts`; wire `BANK_ACCOUNT_LOOKUP` into `bank-account.data.module.ts`'s providers/exports (research.md Decision 8)
- [x] T053 [US4] `import-transactions.handler.ts`: inject `BANK_ACCOUNT_LOOKUP`, verify every distinct row `bankAccountId` before `handle()`; wire `BankAccountDataModule` into `import.module.ts`
- [x] T054 [P] [US4] `create-investment.handler.ts` / `update-investment.handler.ts`: inject `BANK_ACCOUNT_LOOKUP`, verify `bankAccountId` when present; wire `BankAccountDataModule` into `investment.module.ts`
- [x] T055 [P] [US4] `create-recurring-expense.handler.ts` / `update-recurring-expense.handler.ts`: same pattern; wire `BankAccountDataModule` into `recurring-expense.module.ts`
- [x] T056 [US4] `create-installment-plan.handler.ts` / `update-installment-plan.handler.ts`: verify `paymentAccountId` via the already-injected `BankAccountRepositoryPort.findById`; fix the `cardId`/`kindForCard` conflation (`input.cardId && !cardKind` → `CardNotFoundError`) — no new port needed, `installment-plan.module.ts` already imports `BankAccountDataModule`
- [x] T057 [P] [US4] Update the 3 unit specs broken by the new constructor params (`import-transactions.handler.spec.ts`, `create-investment.handler.spec.ts`, `update-investment.handler.spec.ts`, `create-recurring-expense.handler.spec.ts`, `update-recurring-expense.handler.spec.ts`, `update-installment-plan.handler.spec.ts`) and the 1 integration spec (`payment-account-change.integration.test.ts`) with a fake/real `BankAccountLookupPort`/`BankAccountRepositoryPort`
- [x] T058 [P] [US4] E2E: add a second-user-owns-a-foreign-account/card fixture + ownership-rejection tests to `import.http.spec.ts`, `investments.http.spec.ts`, `recurring.http.spec.ts`, `installments.http.spec.ts` (SC-005)

**Checkpoint**: All five write paths reject a foreign FK before persisting; `kindForCard`'s
null-conflation no longer lets a foreign card slip through.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Close the loop on the conformance-debt tracking this feature exists to resolve, and confirm no regressions.

- [x] T048 [P] Update `docs/PENDING.md` — mark points 1, 2 AND 3 (US4 extended scope) under "Deuda de conformidad con la constitución v2.0.0" as closed by specs/016, following the style of point 4's closure note (added by specs/015)
- [x] T049 [P] Add a new Sync Impact Report entry at the top of `.specify/memory/constitution.md` recording this closure (MINOR version bump — no principle redefined, a documented conformance gap closed) — mirror the 2.1.0 report's structure
- [x] T049a [P] Add a durable "Identifiers:" bullet under CLAUDE.md's `## Conventions` section (next to the existing "Money:"/"Validation:"/"i18n:" bullets) stating: every row id is UUID v7 (`@default(uuid(7))` in schema.prisma; application-minted ids via `apps/api/src/infra/id/generate-row-id.ts`), validated at the API boundary via `@finance/contracts`'s shared `rowId` schema, rejected with `INVALID_ID_FORMAT` — distinct from FR-008's already-covered `docs/PENDING.md`/constitution updates, this is the discoverable reference future contributors would grep for
- [x] T050 Run `pnpm --filter @finance/api test && pnpm --filter @finance/api test:integration && pnpm --filter @finance/api test:e2e && pnpm --filter @finance/contracts test && pnpm typecheck` and confirm zero regressions (SC-003)
- [x] T051 Walk through quickstart.md end-to-end (§1-§6) manually once, to catch anything the automated tests don't (e.g. the literal-route-vs-`:id` check in §4)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS US1 and US2.
- **US1 (Phase 3)** and **US2 (Phase 4)**: Both depend only on Foundational completion — genuinely independent of each other (US1 validates incoming ids; US2 changes how ids are minted) and can proceed in parallel or in either order.
- **US3 (Phase 5)**: Depends on US1 AND US2 being complete (its own acceptance scenario requires both, per spec.md).
- **US4 (Phase 5b)**: Structurally independent of US1-3 (a different gap — authorization, not format) — depends only on Setup/Foundational, added later and implemented after US1-3 as a practical matter, not a technical dependency.
- **Polish (Phase 6)**: Depends on all four user stories being complete.

### Parallel Opportunities

- T002 and T003 (Foundational) can run in parallel — different files, no shared dependency.
- Within US1: T006-T011 (tests) can all run in parallel; T014-T033 (the 13 params files + 12 contracts files) can all run in parallel once T012/T013 (pipe wiring) land, since each touches a distinct file.
- Within US2: T035-T040 (tests) can run in parallel; T041-T045 (the 5 handler edits) can all run in parallel, each touching a distinct file.
- US1 and US2 can be staffed and executed fully in parallel by two developers once Foundational is done.

---

## Parallel Example: Foundational + User Story 1 kickoff

```bash
# Foundational, in parallel:
Task: "Create packages/contracts/src/common/row-id.ts"
Task: "Create apps/api/src/infra/id/generate-row-id.ts"

# Once T012/T013 (pipe wiring) land, all 13 params-file edits in parallel:
Task: "Switch account-id.params.ts to rowId"
Task: "Switch card.params.ts to rowId"
Task: "Switch statement.params.ts to rowId"
# ...and so on for the remaining 10 files
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1) — malformed ids are now rejected at the edge for every currently-seeded
   (post-reset) UUID v7 row. This alone satisfies the constitution's most externally visible gap
   (Principle VIII, validation at the edge) and is independently deployable.
3. **STOP and VALIDATE**: run quickstart.md §3-§4.

### Incremental Delivery

1. Setup + Foundational → schema and primitives ready.
2. US1 → malformed-id rejection ships (MVP).
3. US2 → generation fully unified (closes the last of the two-format debt).
4. US3 → the project's own acceptance criteria stop lying about this.
5. Polish → constitution/docs record the closure; full regression pass.

---

## Notes

- [P] tasks touch different files and share no in-phase dependency.
- US1 and US2 are deliberately independent of each other (spec.md's own Independent Test sections)
  — do not let one block the other beyond the shared Foundational phase.
- Every `rowId` swap (T014-T033) is a mechanical one-line change per field; keep each file's diff
  minimal — do not reformat surrounding code.
- Commit after each checkpoint, not necessarily after every task.

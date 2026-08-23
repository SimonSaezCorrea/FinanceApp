# Implementation Plan: Facturación de compras en cuotas con tarjeta de crédito

**Branch**: `014-installment-credit-billing` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-installment-credit-billing/spec.md`

## Summary

A credit-card instalment plan is currently a calendar disconnected from money: no purchase
movement, no pool consumption, no monthly charge, and a statement breakdown whose
"installments" bucket is structurally unreachable. This plan connects it, reproducing what
the issuer actually does — **the pool is committed in full on purchase day, the statement
charges one instalment per period**.

Technically: one purchase movement at plan creation (carrying `installmentPlanId`, which
**excludes** it from any period's total), one new column
`InstallmentPayment.creditStatementId` stamped when a period closes, and instalments
settled when that period is paid. A statement's total gains a third summand alongside its
linked movements and its carry-over.

The single column exists because periods are created **lazily** — a month without card
activity produces no period at all, so deriving "billed" from date windows would let an
instalment in the gap be missed or double-charged. See [research.md](./research.md) R2.

## Technical Context

**Language/Version**: TypeScript 6, Node 20

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs` (api), Prisma 7 / `@prisma/adapter-pg`,
React 19 + Vite + TanStack Query (web), zod (`@finance/contracts`), `decimal.js`
(`@finance/money`). **No new dependency.**

**Storage**: PostgreSQL. One nullable FK column added; **no migration** — this repo has no
`prisma/migrations`, the workflow is `pnpm db:push` + `pnpm db:seed`.

**Testing**: Vitest across `apps/api` (`test:unit` with zero DB connections,
`test:integration` and `test:e2e` against a real Postgres), `apps/web`, and
`packages/contracts`.

**Target Platform**: web (SPA + REST API)

**Project Type**: pnpm + Turborepo monorepo — two deployable apps, shared packages

**Performance Goals**: statement generation stays a single pass per due account; the new
instalment sums are aggregated in Postgres, never by loading rows (matching how
`breakdownForStatement` already works). No N+1 across plans.

**Constraints**: money never crosses a boundary as a float (Constitution I); every query
scoped by `userId` (II); es/en parity (III); tests before implementation (IV); four DDD
layers and one adapter per table (VI). No FX anywhere in the app.

**Scale/Scope**: 4 backend table-domains touched (`installment-payment`,
`installment-plan`, `credit-statement`, `transaction`), 1 new column, 2 new error codes,
0 new endpoints, 0 new tables.

## Constitution Check

_GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design._

| Principle                                                        | Verdict                   | How this plan satisfies it                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Money Precision**                                           | ✅ PASS                   | Every new figure is a `moneyString` across the boundary and `Prisma.Decimal`/`decimal.js` in computation. The statement's third summand is added with `addMoney`, never `+`.                                                                                                                                                                                        |
| **I. Unpaid remainder is a figure, never a rewrite**             | ✅ PASS                   | The schedule is never rewritten. A short payment on a period settles its instalments and carries the shortfall via the existing `CreditStatement.carriedOverAmount`. The instalment's own `carriedOverAmount` stays `"0"` — the debt lives in exactly one place, which is the corollary's whole point. Two levels, one mechanism ([research.md](./research.md) R7). |
| **I. Declare irreversible impact with the code that applies it** | ✅ PASS                   | Deleting a plan already routes through `planDeletionReversal`, used by both the confirmation and the handler. The purchase movement is classified by the same `isChargedToCredit` the reversal already calls, so the declared impact stays produced by the applying code (R5).                                                                                      |
| **II. Per-User Data Isolation**                                  | ✅ PASS                   | Stamping is scoped by account (which is scoped by user) and by plans whose card belongs to that account (FR-008). The cron path keeps its named `scope: "system"` exception, unchanged.                                                                                                                                                                             |
| **III. i18n Parity**                                             | ✅ PASS                   | 2 error codes, 3 instalment statuses, 2 warnings, plus the "settled in part" wording — all in `es.json` **and** `en.json`; `parity.test.ts` gates it.                                                                                                                                                                                                               |
| **IV. Test-First / TDD**                                         | ✅ PASS                   | Tasks are ordered test-first per tier ([research.md](./research.md) R10). SC-003 — nothing billed twice, nothing missed, across a whole plan — is the E2E invariant.                                                                                                                                                                                                |
| **V. SDD & Living Memory**                                       | ⚠️ PENDING                | Spec → clarify → plan chain followed. Constitution + `CLAUDE.md` updates are **mandatory tasks in `tasks.md`**, not follow-ups: the schema, the two error codes and the statement-total rule are all durable facts.                                                                                                                                                 |
| **VI. DDD + CQRS, one table one domain**                         | ⚠️ PASS WITH PREREQUISITE | Each table keeps exactly one adapter; the new write goes through the `InstallmentPlan` aggregate. **Blocking prerequisite**: `installment-plan` has no `*.data.module.ts` leaf, so `credit-statement` cannot depend on it without pulling orchestration into orchestration. Extracting that leaf is task #1 (R3).                                                   |

**No violations to justify.** The one structural gap (VI's missing leaf module) is a
pre-existing deviation from the constitution that this feature fixes rather than works
around, so the Complexity Tracking table stays empty.

### Re-evaluation after Phase 1

Design artifacts introduce no new dependency, no new table, no new endpoint, and no new
cross-table adapter. The `installment-plan.data.module.ts` extraction resolves the only
flagged item. **Gate passes.**

## Project Structure

### Documentation (this feature)

```text
specs/014-installment-credit-billing/
├── plan.md              # This file
├── spec.md              # Approved spec (+ Clarifications session 2026-08-22)
├── research.md          # Phase 0 — R1..R10
├── data-model.md        # Phase 1 — the column, derived values, transitions
├── contracts/
│   └── installments.md  # Phase 1 — @finance/contracts changes
├── quickstart.md        # Phase 1 — validation scenarios A..F
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   ├── schema.prisma                    # + InstallmentPayment.creditStatementId
│   └── seed.ts                          # credit-card plan: purchase, billed, short-settled
└── src/domains/
    ├── installment-payment/             # owns the new column
    │   ├── domain/ports/
    │   │   ├── installment-payment.repository.port.ts    # + stampStatementWithTx,
    │   │   │                                             #   settleForStatementWithTx,
    │   │   │                                             #   listBillableForAccount
    │   │   └── installment-payment-lookup.port.ts        # widened for FR-024
    │   └── infrastructure/prisma-installment-payment.repository.ts
    ├── installment-plan/
    │   ├── installment-plan.data.module.ts               # NEW — leaf (VI prerequisite)
    │   ├── installment-plan.module.ts                    # imports the leaf
    │   ├── domain/
    │   │   ├── installment-plan.aggregate.ts             # + billing invariants (FR-006a/b)
    │   │   ├── installment-billing.ts                    # NEW — pure stamping selection
    │   │   └── errors.ts                                 # + 2 codes
    │   └── application/
    │       ├── plan-dto.mapper.ts                        # + counters, warning, statuses
    │       └── commands/create-installment-plan.handler.ts  # + purchase movement
    ├── credit-statement/
    │   ├── credit-statement.module.ts                    # imports installment-plan leaf
    │   ├── domain/credit-statement.aggregate.ts          # totalFor(linked, instalments)
    │   ├── application/
    │   │   ├── statement-dto.mapper.ts                   # breakdown from two sources
    │   │   └── commands/{generate-statements,pay-credit-statement,sync-statement}.handler.ts
    │   └── infrastructure/prisma-credit-statement.repository.ts
    └── transaction/
        ├── infrastructure/prisma-transaction-sums.repository.ts  # exclude installmentPlanId
        └── application/commands/{update,remove}-transaction.handler.ts  # FR-024

apps/web/src/
├── domains/installments/
│   ├── components/{InstallmentPlanTable,InstallmentPlanList,InstallmentDetailPanel,
│   │               InstallmentFormPanel,PayInstallmentPanel}.tsx
│   └── lib/installmentMetrics.ts
├── domains/accounts/components/BillingSection.tsx        # breakdown with real instalments
└── i18n/{es,en}.json

packages/contracts/src/installments/index.ts              # statuses, counters, warnings
```

**Structure Decision**: no new folder anywhere. The work lands in the four existing
table-domains listed above plus their web counterparts, exactly as Constitution VI
prescribes. The only structural addition is the missing `installment-plan.data.module.ts`
leaf, which the constitution already requires for every table.

## Implementation phasing

Ordered so each step is independently verifiable, matching the spec's user-story
priorities. Every step is test-first.

| Step                                  | Delivers                                                               | Verify with                                                        |
| ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **0. Leaf module**                    | `installment-plan.data.module.ts`; graph stays acyclic                 | `pnpm check:boundaries`, api boots                                 |
| **1. Schema + contracts**             | the column, statuses, counters, warnings, 2 error codes                | `packages/contracts` tests, `db:push`                              |
| **2. Purchase movement (US1)**        | pool drops by the total on plan creation; exclusion from period totals | unit + integration; quickstart A, A2                               |
| **3. Stamping at close (US2)**        | one instalment per period, exactly once, gap-proof                     | unit (selection) + integration (tx, gap); quickstart B, B2, B3, B4 |
| **4. Settling on payment (US3)**      | full and short payments settle instalments; pool moves once            | unit + e2e; quickstart C, C2, C3                                   |
| **5. Invariants (FR-006a/b, FR-024)** | the three refusals                                                     | unit + e2e; quickstart E                                           |
| **6. Web (US4)**                      | counters, absent pay action, short-settled wording, warnings           | web tests; quickstart D, F                                         |
| **7. Seed + memory**                  | seeded new shape; constitution + `CLAUDE.md`                           | full quickstart; Constitution V                                    |

Steps 2–4 are the P1 stories and must land in order: 3 has nothing to bill without 2, and
4 has nothing to settle without 3. Steps 5–6 can proceed in parallel once 4 is green.

## Risks

| Risk                                                                                                                 | Mitigation                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The purchase movement leaks into a period's total, billing the whole purchase at once — the exact defect being fixed | The exclusion is the first thing step 2 tests, at the repository level (`sumLinkedTransactions`, `netForPeriod`), not only end to end                                |
| `creditUsed` moves twice — once on purchase, once when the period charges the instalment                             | The instalment is not a movement, so nothing increments the pool at close time. Asserted explicitly in quickstart C (available credit rises by 130.000, not 220.000) |
| A retried or concurrent generation double-stamps                                                                     | Selection is `creditStatementId IS NULL`, applied inside the closing `$transaction`; the write is idempotent by construction                                         |
| `sync` drops the stamped instalments while recomputing from movements                                                | FR-012 has its own quickstart step (B4) and an integration test                                                                                                      |
| Non-credit-card plans regress                                                                                        | `billedCount === 0` and `billingWarning === null` are contract-level invariants for them; quickstart A2 is the guard                                                 |

## Complexity Tracking

> No constitutional violations to justify. Table intentionally empty.

# Phase 0 Research: Accounts Management

Decisions resolved with the maintainer. No open `NEEDS CLARIFICATION`.

## D1 — Balance field model

- **Decision:** keep `currentBalance` as the **reconciled/cached** value; add `initialBalance`
  (user-set, the manual seed). `currentBalance = initialBalance + Σ(INCOME) − Σ(EXPENSE)` over
  linked transactions.
- **Rationale:** satisfies both "user sets the balance manually" (initialBalance) and "reconcile from
  transactions" (currentBalance) without losing the seed.
- **Alternatives:** single editable balance (can't reconcile); fully derived (loses manual seed).

## D2 — Reconciliation

- **Decision:** compute via a scoped Prisma aggregate — `groupBy`/`aggregate` of `Transaction.amount`
  by `type` where `bankAccountId = id AND userId = userId`; INCOME − EXPENSE, summed with
  `@finance/money` (decimal strings). Triggered by `POST /accounts/:id/reconcile` (writes
  `currentBalance`) and reflected on read.
- **Rationale:** predictable, cheap, no cross-domain write coupling.
- **Alternatives:** recompute on every transaction mutation (couples transactions→accounts now).

## D3 — Type & status modeling

- **Decision:** Prisma enums `AccountType` (CHECKING, SAVINGS, CREDIT_CARD, DEBIT_CARD, CASH, OTHER,
  default OTHER) and `AccountStatus` (ACTIVE, INACTIVE, default ACTIVE). List filter via
  `?status=active|inactive` (omitted = all).
- **Rationale:** explicit, i18n-mappable, filterable; preserves history (no soft-delete).

## D4 — Delete behavior

- **Decision:** deleting an account **unlinks** its transactions — `Transaction.bankAccount` relation
  is already `onDelete: SetNull` with a nullable `bankAccountId`, so existing transactions survive
  with `bankAccountId = null`.
- **Rationale:** accounts don't own transactions; history must not be destroyed.

## D5 — Migration safety

- **Decision:** new columns have defaults (`type=OTHER`, `status=ACTIVE`, `initialBalance=0`), so the
  migration backfills existing rows safely. `currentBalance` stays as-is until first reconcile.
- **Rationale:** non-breaking migration on existing data (demo seed rows).

## D6 — UI

- **Decision:** add a `Select` primitive to `shared/ui` (token-driven) for type/status dropdowns;
  reuse `Field`, `Input`, `Badge` (status/type), `PageHeader`, states. New `/accounts/:id` route.
- **Rationale:** consistent with the design system; minimal new surface.

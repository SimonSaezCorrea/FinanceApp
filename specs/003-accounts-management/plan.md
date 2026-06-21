# Implementation Plan: Accounts Management

**Branch**: `003-accounts-management` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-accounts-management/spec.md`

## Summary

Extend the existing `accounts` domain (backend + frontend) so accounts have a **type** and
**status**, a user-set **initial balance**, and a **reconciled current balance** = initialBalance +
Σ(linked INCOME) − Σ(linked EXPENSE). Full CRUD + status toggle + status filter + reconcile, in
es/en, on the design system. Requires a Prisma schema change (migration) → memory sync.

## Technical Context

**Language/Version**: TypeScript 5 — NestJS (apps/api) + React 18/Vite (apps/web).

**Primary Dependencies**: existing — Prisma, zod (`@finance/contracts`), `@finance/money`, TanStack
Query, react-router, design-system primitives. No new deps.

**Storage**: PostgreSQL via Prisma. **Schema change** on `BankAccount`:
- add `type` enum `AccountType` (CHECKING, SAVINGS, CREDIT_CARD, DEBIT_CARD, CASH, OTHER), default `OTHER`.
- add `status` enum `AccountStatus` (ACTIVE, INACTIVE), default `ACTIVE`.
- add `initialBalance Decimal(18,4)` default 0 (user-set); keep `currentBalance Decimal(18,4)` as the
  reconciled/cached value.

**Testing**: Vitest — service unit tests (reconciliation math, scoping, status filter) + web component
tests (list/filter/form render).

**Target Platform**: monorepo apps.

**Project Type**: domain extension (accounts) across api + web.

**Performance Goals**: reconciliation is a scoped aggregate query per account; fine at expected scale.

**Constraints**: decimal money (no floats) via `@finance/money` / `Prisma.Decimal`; per-user scoping
on every query; es/en parity; design system; `pnpm check:boundaries` stays green.

**Scale/Scope**: one domain, ~6 endpoints, list+form+detail screens.

## Constitution Check

*GATE: pass before Phase 0; re-check after design.*

| Principle | Impact | Verdict |
|-----------|--------|---------|
| I. Money Precision | initialBalance/currentBalance are `Decimal`; reconciliation sums via `@finance/money` strings | ✅ Honored |
| II. Per-User Isolation | every account query scoped by `userId`; reconciliation filters transactions by `userId` + account | ✅ Honored |
| III. i18n Parity | new labels (types, statuses, actions, filter) added to es+en | ✅ Honored |
| IV. Test-First | Vitest for reconciliation + service; web tests for list/form | ✅ Honored |
| V. SDD & Living Memory | this plan is the artifact; **schema change** → CLAUDE.md (data model) at memory-sync | ✅ Honored |
| Architecture norms | stays in `domains/accounts`; repo scoped; zod contracts; tokens-only UI | ✅ Honored |

**Data-model change** (new enums + `initialBalance`) → Prisma migration; record in CLAUDE.md
(data model) at memory-sync. No constitution version bump (no principle change).

## Project Structure

### Documentation (this feature)

```text
specs/003-accounts-management/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/accounts-api.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (touched)

```text
packages/contracts/src/accounts/index.ts   # type/status enums, initialBalance, list filter, reconcile result
apps/api/prisma/schema.prisma               # AccountType, AccountStatus, initialBalance on BankAccount (+ migration)
apps/api/src/domains/accounts/
  accounts.repository.ts                     # status filter; reconciliation aggregate (sum income/expense by account+userId)
  accounts.service.ts                        # create/update/get/list(filter)/remove/setStatus/reconcile
  accounts.controller.ts                     # GET (?status=), GET :id, POST, PATCH :id, DELETE :id, POST :id/status, POST :id/reconcile
  accounts.service.spec.ts                   # reconciliation math, status filter, not-found scoping
apps/web/src/domains/accounts/
  api/accountsApi.ts  hooks/useAccounts.ts (+ mutations)
  components/AccountForm.tsx                  # create/edit form (Field/Input/Select)
  routes/AccountsRoute.tsx                    # list + status filter + create
  routes/AccountDetailRoute.tsx              # detail + edit + status toggle + delete + reconcile
apps/web/src/app/router.tsx                  # /accounts/:id route
apps/web/src/i18n/{es,en}.json               # account types/status/actions/filter labels
```

**Structure Decision**: extend the existing accounts domain in place (no new module). Add a `Select`
primitive to `shared/ui` for the type/status dropdowns (design-system addition).

## Phase notes

- **research.md**: field model (initialBalance + reconciled currentBalance), reconciliation query
  shape, delete→unlink behavior (Transaction.bankAccount already `onDelete: SetNull`), enum defaults
  & migration safety (existing rows get defaults).
- **data-model.md**: updated `BankAccount` + enums; relation to Transaction for reconciliation.
- **contracts/accounts-api.md**: endpoints, request/response shapes, status filter query, reconcile.
- **quickstart.md**: validation scenarios mapping to SC.

## Complexity Tracking

| Decision | Why | Rejected alternative |
|----------|-----|----------------------|
| `initialBalance` + reconciled `currentBalance` | satisfies "manual balance" AND "reconcile from transactions" without losing the starting point | single editable balance (can't reconcile) / fully derived (loses manual seed) |
| Reconcile on demand (endpoint) + on read | predictable, cheap; avoids write-amplification on every transaction change | recompute on every transaction mutation (cross-domain coupling now) |
| Status as enum + query filter | matches "visual badge + filter", keeps history | boolean isActive (less explicit) / soft-delete (hides data) |

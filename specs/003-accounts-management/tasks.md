# Tasks: Accounts Management

**Feature**: specs/003-accounts-management | **Plan**: [plan.md](./plan.md)

Extends the `accounts` domain (api + web). `[P]` = parallelizable.

## Phase 1: Schema & contracts (foundational)

- [x] T001 Prisma: add `AccountType` + `AccountStatus` enums and `type`/`status`/`initialBalance` to `BankAccount` in `apps/api/prisma/schema.prisma` (defaults OTHER/ACTIVE/0); run migration `add_account_type_status_initialbalance` + `prisma generate`
- [x] T002 [P] Contracts: extend `packages/contracts/src/accounts/index.ts` — `accountType`/`accountStatus` zod enums, add `type`/`status`/`initialBalance` to `bankAccountSchema` + create/update, add `accountFilters` ({status?}); rebuild contracts

## Phase 2: Backend (US1–US4)

- [x] T003 [US1] Repository: status filter in `list(userId, {status?})`; map new fields — `apps/api/src/domains/accounts/accounts.repository.ts`
- [x] T004 [US4] Repository: `reconcile(userId, id)` aggregate — sum Transaction.amount by type where bankAccountId+userId; return income/expense sums
- [x] T005 [US1] Service: create/update/get/list(filter) handle type/status/initialBalance; `toContract` maps them (money strings) — `accounts.service.ts`
- [x] T006 [US3] Service: `setStatus(userId,id,status)`; [US4] `reconcile(userId,id)` → currentBalance = initialBalance + Σincome − Σexpense via `@finance/money`
- [x] T007 [US2/US3/US4] Controller: `GET ?status`, `GET :id`, `POST`, `PATCH :id`, `POST :id/status`, `POST :id/reconcile`, `DELETE :id` — `accounts.controller.ts`
- [x] T008 [P] Service tests: reconciliation math (exact), status filter, not-found scoping — `accounts.service.spec.ts`

## Phase 3: Frontend (US1–US4)

- [x] T009 [P] Add `Select` primitive to `apps/web/src/shared/ui/select.tsx` (token-driven)
- [x] T010 [US1] `accountsApi.ts` + `useAccounts.ts`: list(filter) + create/update/remove/setStatus/reconcile mutations (TanStack Query, invalidate on success)
- [x] T011 [US1/US2] `components/AccountForm.tsx` — create/edit (name, type Select, institution, currency, initialBalance, status)
- [x] T012 [US1/US3] `routes/AccountsRoute.tsx` — list with type + status `Badge` + balance, status filter, "new account" action → form
- [x] T013 [US2/US3/US4] `routes/AccountDetailRoute.tsx` — detail + edit + status toggle + delete (confirm) + reconcile button; route `/accounts/:id` in `app/router.tsx`
- [x] T014 [P] [US1] i18n es/en: account types, statuses, actions (new/edit/delete/reconcile/activate/deactivate), filter labels
- [x] T015 [P] Web tests: AccountsRoute (list + filter render), AccountForm (renders fields)

## Phase 4: Polish & verify

- [x] T016 Update demo seed (`apps/api/prisma/seed.ts`) to set type/status/initialBalance on demo accounts
- [x] T017 Memory sync: CLAUDE.md data-model note (BankAccount type/status/initialBalance) + design-system `Select`
- [x] T018 Verify: `pnpm --filter @finance/api test`, `pnpm --filter @finance/web test`, `pnpm build`, `pnpm check:boundaries` green

## Dependencies

Schema+contracts (T001-002) → backend (T003-008) → frontend (T009-015) → polish (T016-018).

**Totals**: 18 tasks.

# Tasks: Transactions View Redesign

**Feature**: specs/005-transactions-redesign | **Plan**: [plan.md](./plan.md)

## Phase 1: Setup — i18n keys

**Purpose**: Add all new i18n keys first so every component can use `t()` from the start.

- [x] T001 [P] Add new i18n keys to `apps/web/src/i18n/es.json` under `transactions.kpi.*` (income, expense, balance, byCurrency), `transactions.filters.*` (all, income, expense, account, allAccounts, card, category, categoryPlaceholder, from, to, clearFilters, showInactive), `transactions.table.*` (noCategory, noAccount, import)
- [x] T002 [P] Mirror all new keys from T001 into `apps/web/src/i18n/en.json` with English values

---

## Phase 2: Foundational — utility libs (test-first)

**Purpose**: Core logic (`summarizeByCurrency`, `clientFilter`, `categoryIcon`) must be tested before any component uses it. Tests written first (red), then implementation (green).

- [x] T003 [P] Write failing Vitest tests for `apps/web/src/domains/transactions/lib/transactionMetrics.test.ts`: `summarizeByCurrency` groups by currency, sums income/expense, computes netBalance using Decimal; `clientFilter` performs case-insensitive substring match on `category`; edge cases: empty array, single currency, mixed currencies, null category
- [x] T004 [P] Write failing Vitest tests for `apps/web/src/domains/transactions/lib/categoryIcons.test.ts`: known keywords ("super", "comida", "transport", "sueldo", etc.) map to correct Lucide icon component; unknown/null category maps to `Tag` fallback; case-insensitive match works
- [x] T005 Implement `apps/web/src/domains/transactions/lib/transactionMetrics.ts`: export `summarizeByCurrency(txs: Transaction[]): CurrencyKpi[]` using `Decimal` from `@finance/money`; export `clientFilter(txs: Transaction[], search: string): Transaction[]` (case-insensitive substring on `category`); export `startOfMonth(date: Date): string` and `endOfMonth(date: Date): string` returning ISO-8601 strings (used for default date range). All T003 tests must pass.
- [x] T006 Implement `apps/web/src/domains/transactions/lib/categoryIcons.ts`: export `CATEGORY_ICON_MAP` (array of `{keywords: string[], icon: LucideIcon}`) with entries from research.md; export `categoryIcon(category: string | null): LucideIcon` that returns first keyword match or `Tag`. All T004 tests must pass.

---

## Phase 3: US1 — KPI strip + segmented control

**Story goal**: User opens Transactions and sees multi-currency KPI cards + segmented type filter.

**Independent test**: Load screen with seeded CLP+USD transactions → two KPI groups appear; switch "Ingresos" → expense KPI = 0, list updates.

- [x] T007 [US1] Implement `apps/web/src/domains/transactions/components/TransactionKpiStrip.tsx`: props `{ transactions: Transaction[] }`; calls `summarizeByCurrency` internally; renders one card per currency with totalIncome (`text-success`), totalExpense (`text-accent`), netBalance (negative → `text-accent`, positive → `text-success`); uses `formatMoney` from `@finance/money`; design-system tokens only; i18n via `t('transactions.kpi.*')`
- [x] T008 [US1] Update `apps/web/src/domains/transactions/routes/TransactionsRoute.tsx`: add local `filters` state (`TransactionViewFilters`); initialize `from`/`to` to current month via `startOfMonth`/`endOfMonth`; pass `type` filter to `useTransactions`; render `PageHeader` + `<Segmented>` (Todos/Ingresos/Gastos) + `<TransactionKpiStrip transactions={data ?? []} />`

---

## Phase 4: US2 — Full filter bar + table

**Story goal**: User filters by account/card, category, and date range; table shows rich rows.

**Independent test**: Select one account → only its rows; type "super" in category → only matching rows; pick date range → only rows in range. Table rows show category icon, type badge, account name, date, amount.

- [x] T009 [P] [US2] Implement `apps/web/src/domains/transactions/components/TransactionFiltersBar.tsx`: props `{ filters: TransactionViewFilters; onChange: (f: TransactionViewFilters) => void; accounts: BankAccount[] }`; renders account/card grouped selector (active accounts by default, inactive toggle, cards nested as `account.name · ••••last4`; selecting a card sets `bankAccountId` = parent account id + `selectedCardId`); category `<Input>` with debounce 300 ms; "desde"/"hasta" date inputs; i18n; tokens only
- [x] T010 [P] [US2] Implement `apps/web/src/domains/transactions/components/TransactionTable.tsx`: props `{ transactions: Transaction[]; accounts: BankAccount[] }`; sorts by `occurredAt` descending; each row: `categoryIcon(tx.category)` Lucide icon, `<Badge>` for type (INCOME green / EXPENSE accent), account name resolved from `accounts` array or `t('transactions.table.noAccount')`, formatted date (`occurredAt`), amount colored per type; `overflow-x: auto` wrapper for responsive; empty state via `<EmptyState>` when array is empty; i18n
- [x] T011 [US2] Compose full `TransactionsRoute.tsx`: replace temp list with `<TransactionFiltersBar>` + `<TransactionKpiStrip>` + `<TransactionTable>`; `useAccounts()` for all accounts (pass to FiltersBar and Table); apply `clientFilter(data, filters.categorySearch)` client-side after API fetch; pass `{ type, bankAccountId, from, to }` to `useTransactions`; render `<LoadingState>` / `<ErrorState>` / table area; table area shows `<EmptyState>` when filtered list is empty (not replacing KPIs/filters)

---

## Phase 5: US3 + US4 — Action buttons

**Story goal**: "+ Movimiento" opens modal, "Importar" visible but disabled.

**Independent test**: Click "+ Movimiento" → modal opens; submit → list refreshes, toast appears. "Importar" renders, click → nothing happens.

- [x] T012 [US3] Wire `TransactionCreateModal` into `TransactionsRoute.tsx`: add `modalOpen` state; "+ Movimiento" button in `PageHeader` actions opens modal; `useTransactionMutations().create` already invalidates `["transactions"]` so list and KPIs refresh automatically on success
- [x] T013 [US4] Add disabled "Importar" `<Button>` (ghost variant, `disabled` prop) next to "+ Movimiento" in `TransactionsRoute.tsx` header; clicking does nothing; i18n key `t('transactions.table.import')`

---

## Phase 6: Polish & verification

**Purpose**: Responsive behavior, state coverage, quality gates.

- [x] T014 Responsive: `TransactionTable` wrapper has `overflow-x: auto` (via `Table` primitive); `TransactionFiltersBar` uses `flex-wrap` — verified in implementation
- [x] T015 States: loading → `<LoadingState>`, error → `<ErrorState>`, empty filtered list → `<EmptyState>` inside table area; KPIs and filters remain visible — verified in route implementation
- [x] T016 [P] Quality gates: `pnpm typecheck` ✅ · `pnpm check:boundaries` ✅ · `pnpm test --filter @finance/web` 50/50 ✅

---

## Dependencies

```
T001, T002           (parallel, no deps)
  → T003, T004       (parallel, no deps on each other)
    → T005 (needs T003 green), T006 (needs T004 green)
      → T007, T008   (need T005, T006, T001+T002)
        → T009, T010 (parallel, need T006, T001+T002)
          → T011     (needs T009 + T010 + T008)
            → T012   (needs T011)
              → T013 (needs T012)
                → T014, T015, T016 (parallel polish)
```

**Totals**: 16 tasks across 6 phases. All complete ✅

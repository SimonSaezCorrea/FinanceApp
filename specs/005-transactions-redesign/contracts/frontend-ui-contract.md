# UI Contract: Transactions View

No new API endpoints. All existing contracts consumed as-is.

## API calls made by this screen

| Hook | Endpoint | Params |
|------|----------|--------|
| `useTransactions(filters)` | `GET /api/v1/transactions` | `type?`, `bankAccountId?`, `from?`, `to?` |
| `useAccounts({ status: 'active' })` | `GET /api/v1/accounts?status=active` | `status=active` (default selector) |
| `useAccounts()` | `GET /api/v1/accounts` | no filter (when "incluir inactivas" enabled) |
| `useTransactionMutations().create` | `POST /api/v1/transactions` | `CreateTransaction` body |

## Component interface contracts

### `<TransactionKpiStrip transactions={Transaction[]} />`
- Input: flat array of already-filtered transactions.
- Output: one KPI card per currency found in the array, each showing `{totalIncome, totalExpense, netBalance}`.
- Income amounts: `text-success`. Expense amounts: `text-accent`. Balance negative: `text-accent`; positive: `text-success`.

### `<TransactionFiltersBar filters={…} onChange={…} accounts={BankAccount[]} />`
- Controlled component — parent owns state.
- Emits full `TransactionViewFilters` on any change.
- Segmented: `Todos | Ingresos | Gastos` → sets `filters.type`.
- Account/card selector: grouped; card selection sets `bankAccountId` = parent account id + `selectedCardId`.
- Category input: debounced (300 ms) string → `filters.categorySearch`.
- Date inputs: ISO date strings → `filters.from` / `filters.to`.

### `<TransactionTable transactions={Transaction[]} accounts={BankAccount[]} />`
- Renders rows sorted by `occurredAt` descending.
- Each row: category icon (static map), type badge, account name (resolved from `bankAccountId`), formatted date, amount.
- Scrolls horizontally on narrow viewports (`overflow-x: auto`).
- No inline edit/delete affordances.

### `categoryIcon(category: string | null): LucideIcon`
- Pure function. No React. Exportable utility.
- Matches lowercase `category` against keyword list; returns first match or `Tag`.

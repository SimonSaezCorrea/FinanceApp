# Data Model: Transactions View Redesign

No Prisma schema changes. This is a **pure frontend feature** — all entities already exist in the API and contracts.

## Frontend-only derived types

### `CurrencyKpi`

Derived client-side from the visible transaction list. Not persisted.

```
CurrencyKpi {
  currency: string          // e.g. "CLP", "USD", "EUR"
  totalIncome: Decimal      // sum of INCOME amounts for this currency
  totalExpense: Decimal     // sum of EXPENSE amounts for this currency
  netBalance: Decimal       // totalIncome − totalExpense
}
```

Computed by `summarizeByCurrency(transactions: Transaction[]): CurrencyKpi[]`.

### `TransactionViewFilters`

Local React state. Drives both API call and client-side post-filtering.

```
TransactionViewFilters {
  type?: "INCOME" | "EXPENSE"    // → API param
  bankAccountId?: string          // → API param (also used when a card is selected)
  from?: string                   // ISO-8601 → API param (default: first day of current month)
  to?: string                     // ISO-8601 → API param (default: last day of current month)
  categorySearch?: string         // client-side substring filter (not sent to API)
  selectedCardId?: string         // UI state only; resolves to bankAccountId for API
  showInactiveAccounts: boolean   // controls account selector display (default: false)
}
```

### `CategoryIconEntry`

```
CategoryIconEntry {
  keywords: string[]    // lowercase substrings to match against category
  icon: LucideIcon      // Lucide React component
}
```

Stored as a static `CATEGORY_ICON_MAP: CategoryIconEntry[]` array. Fallback: `Tag` icon.

## Existing entities consumed (no changes)

| Entity        | Source               | Fields used                                                                   |
| ------------- | -------------------- | ----------------------------------------------------------------------------- |
| `Transaction` | `@finance/contracts` | `id`, `type`, `amount`, `currency`, `occurredAt`, `category`, `bankAccountId` |
| `BankAccount` | `@finance/contracts` | `id`, `name`, `status`, `cards[]`                                             |
| `Card`        | `@finance/contracts` | `id`, `last4`, `kind`, `bankAccountId` (via parent account)                   |

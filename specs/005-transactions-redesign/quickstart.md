# Quickstart & Validation Guide: Transactions View Redesign

## Prerequisites

```
pnpm install
# apps/api/.env: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, PORT, CORS_ORIGIN
# apps/web/.env: VITE_API_URL=http://localhost:3000
pnpm db:migrate && pnpm db:seed
```

## Start

```
pnpm dev:api    # NestJS on :3000
pnpm dev:web    # Vite on :5173
```

Log in with `demo@finance.local` / `demo1234`. Navigate to **Movimientos**.

## Validation scenarios

### 1. KPI strip — multi-currency grouping

**Setup**: seed has transactions in CLP and USD.
**Check**: Two KPI groups appear (CLP · USD). Each shows income, expense, net.
**Income**: displayed in `text-success` (green). **Expense**: `text-accent` (clay).

### 2. Segmented control — type filter

**Action**: Click "Ingresos".
**Check**: Only INCOME rows remain. Expense KPI = 0 for every currency group.
**Action**: Click "Gastos".
**Check**: Only EXPENSE rows remain. Income KPI = 0.
**Action**: Click "Todos".
**Check**: Full list restored.

### 3. Account/card selector

**Action**: Select a specific account from the dropdown.
**Check**: Only transactions with that `bankAccountId` appear. KPIs update.
**Action**: Enable "incluir inactivas" toggle.
**Check**: Inactive accounts appear in the selector.
**Action**: Select a card entry (displayed as `account · ••••last4`).
**Check**: Transactions filtered to parent account. Selected card shown in selector label.

### 4. Category search

**Action**: Type "super" in category field.
**Check**: Only transactions whose `category` contains "super" (case-insensitive) appear.
**Action**: Clear field.
**Check**: Full (type/account/date-filtered) list restored.

### 5. Date range — default and custom

**On load**: `desde` = first day of current month, `hasta` = last day. Only current-month transactions shown.
**Action**: Clear `desde`.
**Check**: All transactions up to `hasta` appear.
**Action**: Set `desde` after `hasta` (invalid range).
**Check**: `hasta` selector enforces minimum = `desde` (or input is visually invalid).

### 6. "+ Movimiento" action

**Action**: Click "+ Movimiento".
**Check**: `TransactionCreateModal` opens.
**Action**: Submit valid transaction.
**Check**: Modal closes, toast appears, new row is at top of list, KPIs update — no full page reload.

### 7. "Importar" button

**Check**: Button is visible, appears disabled/muted.
**Action**: Click it.
**Check**: Nothing happens (no navigation, no error, no modal).

### 8. States

**Loading**: Throttle network → skeleton/loading state shown inside table area.
**Empty**: Apply filters that match zero transactions → empty state inside table; KPIs show 0.
**Error**: Disconnect API → error state with retry affordance.

### 9. i18n

Switch language to English (profile or URL). All labels, placeholders, and state messages must render in English with no raw keys visible.

### 10. Responsive

Resize viewport < 860 px. Table scrolls horizontally; no content overflows page.

## Quality gates

```
pnpm typecheck
pnpm check:boundaries
pnpm test --filter @finance/web
pnpm build
```

All must pass with zero errors.

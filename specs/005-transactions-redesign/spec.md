# Feature Specification: Transactions View Redesign

**Feature Branch**: `005-transactions-redesign`

**Created**: 2026-06-28

**Status**: Draft

**Input**: Redesign the Transactions view (apps/web) to match the high-fidelity design handoff in design_handoff_financeapp/README.md (section "5. Movimientos"). The current TransactionsRoute.tsx is a bare list with no filters, no KPIs, and no actions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — View and filter transactions at a glance (Priority: P1)

A user navigates to the Transactions screen and immediately sees a summary of their income, expenses, and net balance for the current month. They use the segmented control and filters to narrow the list to what they care about.

**Why this priority**: The KPI strip + segmented filter is the primary value of this screen — without it, the screen is just a raw list. Everything else depends on the filtered dataset being visible here first.

**Independent Test**: Can be tested end-to-end by loading the screen with seeded data and verifying KPI values match the sum of the visible list, plus checking that switching the segmented control refreshes both the list and KPIs.

**Acceptance Scenarios**:

1. **Given** the user has transactions of both types, **When** they open Transactions, **Then** they see 3 KPI cards (total income in green, total expenses in accent-red, net balance) computed from the currently visible (filtered) list.
2. **Given** the default filter is "Todos", **When** the user taps "Ingresos", **Then** the list shows only INCOME transactions and KPIs update to reflect only those rows (expenses = 0, balance = income total).
3. **Given** any active filter, **When** the resulting list is empty, **Then** an empty state is displayed inside the table area (not replacing the KPIs or filters).

---

### User Story 2 — Narrow transactions by account, category, and date range (Priority: P2)

A user wants to see all grocery expenses in their checking account during May. They select the account, type a category keyword, and pick a date range — the list updates reactively.

**Why this priority**: Filters are how the screen becomes useful for real money review. Account and date filters hit the API; category filter is applied client-side on the already-fetched result so it feels instant.

**Independent Test**: Seeded data with transactions across 2 accounts and 3 categories. Select one account → verify only its transactions appear. Type a partial category string → verify only matching rows remain. Pick a date range → verify rows outside it disappear.

**Acceptance Scenarios**:

1. **Given** transactions across multiple accounts, **When** the user selects one account from the selector, **Then** only that account's transactions appear and the KPIs reflect that subset.
2. **Given** a transaction list, **When** the user types a partial category string, **Then** only transactions whose category contains that string (case-insensitive) appear; clearing the field restores the full list.
3. **Given** any state, **When** the user picks a "from" date, **Then** only transactions on or after that date appear; likewise for "to" (inclusive on both ends).
4. **Given** all filters applied, **When** the user clears all of them, **Then** the full unfiltered list is restored.

---

### User Story 3 — Create a new transaction from this screen (Priority: P3)

A user spots they forgot to log a payment. They click "+ Movimiento", fill in the modal, save, and immediately see the new transaction appear in the list with KPIs updated.

**Why this priority**: The action button is a convenience; the modal already exists. It's lower priority than the read-path but rounds out the screen as a self-contained work surface.

**Independent Test**: Click "+ Movimiento", submit a valid transaction, modal closes, new row appears at top of the list, KPI cards update.

**Acceptance Scenarios**:

1. **Given** the Transactions screen, **When** the user clicks "+ Movimiento", **Then** the transaction creation modal opens.
2. **Given** the modal is open and the user submits valid data, **When** the save is confirmed, **Then** the modal closes, a success toast appears, and the new transaction is reflected in the list and KPIs without a full page reload.

---

### User Story 4 — Importar button visible but deferred (Priority: P4)

The "Importar" button is visible on the screen so users know the feature exists, but it is non-functional in this release.

**Why this priority**: Design parity and discoverability. The real import feature is deferred; a disabled button signals intent without blocking the redesign.

**Independent Test**: Verify the button is rendered, visually distinct as disabled, and does nothing on click.

**Acceptance Scenarios**:

1. **Given** the Transactions screen, **When** the user views the action area, **Then** an "Importar" button is visible and in a disabled/muted state.
2. **Given** the "Importar" button, **When** the user clicks it, **Then** nothing happens (no navigation, no modal, no error).

---

### Edge Cases

- What happens when the user has no transactions at all? → Empty state rendered inside table area; KPIs show 0/0/0.
- What happens when the API is slow or fails? → Loading state while fetching; error state with a retry affordance if the request fails.
- What if a transaction has no category? → No category icon shown; row still renders correctly (category cell blank or dash).
- What if a transaction has no linked account? → Account column shows a dash or "Sin cuenta".
- What if the net balance is negative? → Net balance KPI displays in accent-red (same as expense color).
- What if date "from" is after "to"? → The "to" selector enforces a minimum equal to "from" (or vice versa) to prevent invalid ranges.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The screen MUST display KPI cards grouped by currency (e.g. CLP · USD · EUR): total income, total expenses, and net balance per currency, all computed from the currently visible (post-filter) transaction list. By default no conversion is applied. An optional "convert to base currency" toggle MAY be provided; when active, amounts are converted using a user-supplied or system exchange rate and all KPIs collapse into a single currency view.
- **FR-002**: A segmented control (Todos / Ingresos / Gastos) MUST be present and drive the `type` parameter sent to the data source; switching segments re-fetches or re-filters data and updates KPIs.
- **FR-003**: A combined account/card selector MUST allow the user to filter by a single bank account or by a specific card. Active accounts are shown by default; an "incluir inactivas" toggle reveals inactive accounts. Selecting "Todas" (default) removes the filter. Since the current transaction contract only exposes `bankAccountId`, filtering by card MUST resolve to the card's parent account (the plan phase must decide whether this is a client-side derivation or requires an API contract extension).
- **FR-004**: A category field MUST allow free-text input; the filter is applied client-side (case-insensitive substring match on the `category` field); clearing restores all rows.
- **FR-005**: A date-range selector MUST expose "desde" and "hasta" inputs; the chosen range is passed to the data source as `from`/`to` parameters; both are optional independently.
- **FR-006**: The transaction table MUST display each row with: a category icon (mapped from the category slug to a Lucide icon, with a generic fallback), a type chip (INCOME/EXPENSE), the linked account name (or a dash if none), the formatted transaction date, and the amount colored green for INCOME and accent-red for EXPENSE.
- **FR-007**: A "+ Movimiento" button MUST open the existing transaction creation modal; after successful creation the list and KPIs MUST refresh without a full page reload.
- **FR-008**: An "Importar" button MUST be rendered in a visually disabled state and perform no action on click.
- **FR-009**: The screen MUST render a loading state while data is being fetched, an error state if the fetch fails, and an empty state (inside the table area) when the filtered list is empty — using the existing `shared/ui/states` components.
- **FR-010**: All user-visible labels, placeholders, and messages MUST exist in both the Spanish (`es`) and English (`en`) i18n catalogs under consistent keys; no hardcoded UI strings.
- **FR-011**: All colors MUST be expressed through design-system tokens (no hardcoded hex, rgb, or hsl values); income uses the success token, expenses use the accent/danger token, per the design handoff.
- **FR-012**: The screen MUST be usable on narrow viewports; the table MUST scroll horizontally rather than overflow the page.

### Key Entities

- **Transaction**: a financial event with type (INCOME|EXPENSE), amount (positive decimal), currency, date, optional category slug, optional description, optional linked bank account.
- **TransactionFilters**: the active combination of type, bankAccountId, from-date, and to-date used to query the data source.
- **KPI summary**: a derived, read-only triple (totalIncome, totalExpense, netBalance) computed from the visible transaction list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can reach a filtered view of their transactions (by type, account, category, or date) within 3 interactions from opening the screen.
- **SC-002**: KPI cards are always consistent with the visible list — no case where the displayed totals do not match the sum of the rendered rows.
- **SC-003**: The screen is fully operational in both Spanish and English with no missing i18n keys or raw key strings visible to the user.
- **SC-004**: The screen correctly renders loading, empty, and error states — no blank or broken UI during any data-fetch lifecycle phase.
- **SC-005**: Creating a transaction via "+ Movimiento" reflects in the list without a full page reload.
- **SC-006**: The redesigned screen passes `pnpm typecheck`, `pnpm check:boundaries`, and all existing tests remain green.

## Assumptions

- The existing `TransactionCreateModal` component and `useTransactions` hook are functional and will be reused; this spec does not redesign them.
- The accounts list (for the account selector) is fetched from the same API used by other screens; no new endpoint is needed.
- Category icons are mapped statically: a fixed lookup table matches known category keywords (case-insensitive) to Lucide icon names; any category not matched uses a generic `Tag` icon as fallback. No dynamic category management is in scope.
- The default date range on screen load is the current calendar month (first day to last day of the current month); the user can clear or change it freely.
- Pagination is out of scope; the API is called with the active filters and the full filtered result is rendered.
- Inline editing or deleting transactions from this screen is out of scope.
- The real "Importar" (file upload) feature is deferred; only the disabled button placeholder is in scope.
- The screen is accessed by authenticated users only; auth gating is handled by the existing `RequireAuth` wrapper.

## Clarifications

### Session 2026-06-28

- Q: How should KPI totals handle multi-currency transactions? → A: KPIs shown per currency by default (no conversion). An optional toggle to convert to a base currency (user-supplied or system rate) collapses all KPIs into one currency view.
- Q: How should category icons be determined for free-text categories? → A: Static keyword map (case-insensitive) to Lucide icons; fallback to `Tag` icon for unknown categories.
- Q: Which accounts appear in the account/card selector, and can cards be selected? → A: Active accounts by default; "incluir inactivas" toggle reveals inactive ones. Cards are also selectable; card filter resolves to parent account's bankAccountId (plan to decide if client-side derivation suffices or API contract needs extension).
- Q: What is the default date range on screen load? → A: Current calendar month (first to last day), pre-populated; user can clear or change freely.

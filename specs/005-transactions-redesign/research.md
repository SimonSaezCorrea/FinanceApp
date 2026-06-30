# Research: Transactions View Redesign

## Multi-currency KPI aggregation

**Decision**: Group KPIs by currency — one `{income, expense, balance}` triple per currency present in the visible list. No conversion applied by default.

**Rationale**: The transactions contract already carries `currency` per row. Client-side `reduce` over the filtered array produces the groups with zero API changes. A "convert to base currency" toggle is recorded in the spec as optional; it requires an exchange-rate source (none exists in the system today) and is deferred to a follow-up feature — the UI will reserve the toggle slot but leave it disabled.

**Alternatives considered**:

- Single-currency KPIs (sum everything, ignore currency) — rejected: silently mixes CLP/USD/EUR into a meaningless total.
- Backend-computed aggregation endpoint — rejected: unnecessary round-trip; the frontend already fetches all rows for the filtered period.

---

## Category icon mapping

**Decision**: Static lookup table (`Record<string, LucideIcon>`) keyed by lowercase keyword substrings. A category string is matched against each keyword (case-insensitive `includes`). First match wins; no match → `Tag` fallback icon.

**Rationale**: Categories are free-text; there is no enum. The dashboard uses a similar pattern for the donut chart. Lucide is already installed and tree-shaken per import. The table is small (<20 entries) and zero-runtime-cost.

**Alternatives considered**:

- Dynamic icon from category metadata — rejected: no category management system exists.
- Emoji avatar — rejected: inconsistent with the design system (Lucide everywhere).
- Colored circle only — rejected: less informative than an icon.

**Initial keyword map** (expandable):

| Keyword                                       | Icon              |
| --------------------------------------------- | ----------------- |
| super, mercado, almacén                       | `ShoppingCart`    |
| comida, restaurant, café, food                | `UtensilsCrossed` |
| transport, metro, uber, taxi, benci, gasolina | `Car`             |
| salud, médico, farmacia, doctor               | `HeartPulse`      |
| arriendo, rent, alquiler                      | `Home`            |
| netflix, spotify, suscri, streaming           | `Tv`              |
| sueldo, salario, ingreso                      | `Banknote`        |
| luz, agua, gas, electrici                     | `Zap`             |
| viaje, vuelo, hotel                           | `Plane`           |
| educación, colegio, universidad               | `GraduationCap`   |
| gym, deporte                                  | `Dumbbell`        |
| mascota                                       | `PawPrint`        |
| regalo, gift                                  | `Gift`            |
| (no match)                                    | `Tag`             |

---

## Account/card selector

**Decision**: A grouped `<Select>` (or custom dropdown) renders:

- Group "Cuentas activas" — all active accounts by name.
- Group "Tarjetas" — all cards nested under those accounts, displayed as `account.name · ••••last4`.
- When "incluir inactivas" toggle is on, a second group "Cuentas inactivas" appears.

Selecting a **card** resolves to the card's `account.bankAccountId` as the `bankAccountId` filter value — no API change required. The UI tracks internally which card was selected for display, but the API filter is always `bankAccountId`.

**Rationale**: `BankAccount` response already includes `cards[]` (from spec 004). No new endpoint needed. The `transactionsApi` only accepts `bankAccountId`, which is sufficient since all of a card's transactions are booked to the parent account.

**Alternatives considered**:

- New `cardId` filter on transactions API — rejected: out of scope; the plan notes this as a potential future enhancement.
- Flat list mixing accounts and cards — rejected: harder to read and navigate.

---

## Default date range

**Decision**: On mount, `from` = first day of current month (00:00:00 UTC), `to` = last day of current month (23:59:59 UTC). Both stored as ISO-8601 strings and passed to `useTransactions`. The user can clear or change either bound independently.

**Rationale**: Matches dashboard behavior; users opening Transactions typically want to review the current month.

---

## Table sort order

**Decision**: Transactions rendered in descending `occurredAt` order (most recent first). Sorting is client-side over the fetched array — no API parameter added.

**Rationale**: Most-recent-first is the standard for financial ledgers. The API returns rows in insertion order; a client `.sort()` is cheap for the typical filtered result set (≤ a few hundred rows for one month).

---

## No new API contracts or dependencies

**Decision**: Pure frontend redesign. No new endpoints, no new packages.

- All required API filters (`type`, `bankAccountId`, `from`, `to`) are already in `TransactionFilters`.
- Lucide icons are already in the project.
- `Segmented`, `Select`, `Input`, `Card`, `Badge`, `Table`, `Dialog`, `states` primitives already exist in `shared/ui`.
- `useTransactions`, `useAccounts`, `useTransactionMutations` hooks are already implemented.

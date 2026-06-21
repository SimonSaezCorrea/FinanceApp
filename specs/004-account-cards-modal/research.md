# Phase 0 Research: Account Modal + Cards

Decisions resolved with the maintainer. No open `NEEDS CLARIFICATION`.

## D1 — Card number security (last 4 only)

- **Decision:** the create/edit card form captures the full number in a local field for UX, but the
  payload sent to the API contains **only `last4`** (client computes `digits.replace(/\D/g,'').slice(-4)`).
  The full PAN is never put into any request, never stored, never displayed. Backend validates
  `last4` is exactly 4 digits and rejects anything longer (defense in depth). No CVV field exists.
- **Rationale:** strongest privacy; full PAN never crosses the network or hits logs/DB.
- **Alternatives:** send full number, trim server-side (PAN on the wire + logs) — rejected.

## D2 — Credit limits (multi-currency)

- **Decision:** `CardLimit { currency, limit, used }` with `@@unique([cardId, currency])`; only credit
  cards have limits. Money as decimal strings on the boundary.
- **Rationale:** integrity + uniqueness per currency; supports the multi-currency requirement.
- **Alternatives:** JSON blob of limits (no DB integrity) — rejected.

## D3 — Card entity & expiry

- **Decision:** `Card { name, kind: CREDIT|DEBIT, last4, expiryMonth (1-12), expiryYear }` belonging to
  an account (`onDelete: Cascade`) and user. Expiry stored as two ints; past dates allowed (UI warns).
- **Rationale:** simple, queryable; no payment-network semantics needed.

## D4 — Account create with cards

- **Decision:** `POST /accounts` accepts an optional `cards[]`; the account + its cards (+ limits) are
  created together (single transaction). Cards are also managed via nested endpoints afterward.
- **Rationale:** the modal creates account + cards in one action; detail manages them later.

## D5 — Modal & preview

- **Decision:** add a `Dialog` primitive using **`@radix-ui/react-dialog`** (accessible: focus trap,
  escape, overlay), styled with tokens. A `CardPreview` component renders a card-style visual that
  updates live from the account/card form state.
- **Rationale:** accessibility + design-system consistency without hand-rolling a modal.

## D6 — Account type VISTA

- **Decision:** add `VISTA` to `AccountType`; the modal offers CHECKING/SAVINGS/VISTA. Legacy values
  remain for back-compat (not offered).
- **Rationale:** matches the requested types without breaking existing rows.

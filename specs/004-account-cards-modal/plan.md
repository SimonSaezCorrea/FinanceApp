# Implementation Plan: Account Creation Modal + Cards

**Branch**: `004-account-cards-modal` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-account-cards-modal/spec.md`

## Summary

Add a **modal with a live card-style preview** for account creation and introduce **Card** +
**CardLimit** entities under an account. Cards are credit/debit; credit cards have per-currency
limits with used amounts. **Only the last 4 digits of any card number ever leave the browser**
(no full PAN, no CVV). Add `VISTA` to account types. Extends the `accounts` domain (api + web) and
the design system (a Dialog primitive). Prisma schema change → memory sync.

## Technical Context

**Language/Version**: TypeScript 5 — NestJS (apps/api) + React 18/Vite (apps/web).

**Primary Dependencies**: existing + **`@radix-ui/react-dialog`** (accessible modal) in apps/web. No
backend deps. zod (`@finance/contracts`), `@finance/money`, TanStack Query.

**Storage**: PostgreSQL/Prisma. **Schema change**:

- `AccountType` += `VISTA`.
- new `Card` { id, accountId, userId, name, kind `CardKind`(CREDIT|DEBIT), last4 (String, exactly 4
  digits), expiryMonth Int, expiryYear Int, createdAt, updatedAt } — `onDelete: Cascade` from account.
- new `CardLimit` { id, cardId, currency, limit Decimal(18,4), used Decimal(18,4) } — `@@unique([cardId, currency])`.

**Testing**: Vitest — service tests (last4 enforcement, debit-has-no-limits, duplicate-currency reject,
scoping) + web tests (modal renders, last4 masking, preview).

**Constraints**: **no full PAN / CVV** anywhere (client sends only last4; backend rejects >4 digits);
decimal money; per-user scoping; es/en; design system; `pnpm check:boundaries` green.

**Scale/Scope**: accounts domain extension + cards sub-resource; modal + preview + card form UI.

## Constitution Check

| Principle                 | Impact                                                          | Verdict         |
| ------------------------- | --------------------------------------------------------------- | --------------- |
| I. Money Precision        | limits/used `Decimal` via `@finance/money` strings              | ✅              |
| II. Per-User Isolation    | cards reached via owner's account; every query scoped by userId | ✅              |
| III. i18n Parity          | new labels es+en                                                | ✅              |
| IV. Test-First            | Vitest for last4 rule, limits, scoping                          | ✅              |
| V. SDD & Living Memory    | schema change → CLAUDE.md data-model at memory-sync             | ✅              |
| Security (sensitive data) | only last4 transmitted/stored; no CVV; backend defense-in-depth | ✅ strengthened |
| Architecture norms        | stays in `domains/accounts`; zod contracts; tokens-only UI      | ✅              |

New dep (`@radix-ui/react-dialog`) + schema change → record in CLAUDE.md. No constitution bump.

## Project Structure

```text
specs/004-account-cards-modal/
├── plan.md research.md data-model.md quickstart.md
├── contracts/cards-api.md
└── checklists/requirements.md  tasks.md

packages/contracts/src/accounts/index.ts   # +VISTA; cardKind, cardLimit, card schemas; create account accepts cards[]
apps/api/prisma/schema.prisma               # AccountType+VISTA; Card, CardLimit (+ migration/db push)
apps/api/src/domains/accounts/
  cards.repository.ts / cards.service.ts     # card CRUD + limit handling + last4 enforcement
  accounts.controller.ts                     # nested card endpoints; account create accepts cards
  accounts.service.ts / accounts.repository.ts # include cards on read; create-with-cards
  *.spec.ts                                  # last4, debit-no-limits, dup-currency, scoping
apps/web/src/shared/ui/dialog.tsx           # Radix dialog primitive (tokens)
apps/web/src/domains/accounts/
  components/CardPreview.tsx                  # live card-style visual
  components/CardForm.tsx                     # name, kind, number->last4 (client), expiry, limits
  components/AccountCreateModal.tsx           # account fields + preview + cards
  routes/AccountsRoute.tsx                    # "new" opens modal
  routes/AccountDetailRoute.tsx              # manage cards
  api/cardsApi.ts hooks/useCards.ts
apps/web/src/i18n/{es,en}.json
```

**Structure Decision**: cards are a **sub-resource of accounts** (nested endpoints
`/accounts/:id/cards`), implemented inside the accounts domain (cards belong to accounts). Add a
`Dialog` primitive to the design system.

## Phase notes

- **research.md**: last4 client-derivation + backend guard; limit model (`@@unique[cardId,currency]`);
  expiry as month+year ints; Radix dialog; account-create-with-cards.
- **data-model.md**: Card + CardLimit + AccountType VISTA.
- **contracts/cards-api.md**: nested endpoints + shapes (card payload has `last4`, never full PAN).
- **quickstart.md**: validation incl. the security check (network shows only last4).

## Complexity Tracking

| Decision                                      | Why                                                             | Rejected                                            |
| --------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| last4 derived client-side, backend rejects >4 | strongest privacy: full PAN never transmitted/stored            | send full + trim server-side (PAN on the wire/logs) |
| CardLimit table (per currency)                | multi-currency limits with per-currency used                    | JSON blob (no integrity/uniqueness)                 |
| Cards nested under accounts                   | cards belong to an account; lifecycle + scoping via the account | top-level cards domain (extra cross-checks)         |
| Radix dialog                                  | accessible modal, matches shadcn base                           | hand-rolled modal (focus trap/a11y burden)          |

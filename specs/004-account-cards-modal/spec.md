# Feature Specification: Account Creation Modal + Cards

**Feature Branch**: `004-account-cards-modal`

**Created**: 2026-06-14

**Status**: Draft

**Input**: User description: "A modal with a card-style design to create an account (type checking/savings/vista, bank, status, initial balance, currency) and attach cards (name, credit/debit, multi-currency credit limits with used amount, card number storing only the last 4 digits, expiry month/year)."

## Overview

Account creation moves into a **modal with a live card-style preview** and gains the ability to
attach **cards** to the account. A user models an account (checking, savings, or **vista/sight**)
and registers their real cards under it — credit or debit — including credit limits per currency.
Card numbers are handled securely: **only the last 4 digits are ever transmitted or stored**.
Extends the `accounts` domain and introduces a **Card** entity (with per-currency limits).

## Clarifications

### Session 2026-06-14

- Q: Account types now? → A: add **VISTA** (sight). Modal offers checking/savings/vista; cards are no
  longer an account "type" (they're the new Card entity). Legacy `CREDIT_CARD/DEBIT_CARD/CASH/OTHER`
  remain in the enum for back-compat but aren't offered in the modal.
- Q: Card number security? → A: the user may type the full number for UX, but **only the last 4
  digits leave the browser**; the full PAN is never transmitted, stored, or shown. No CVV ever.
- Q: Credit limits? → A: a credit card has **one or more limits, each `{ currency, limit, used }`**.
- Q: Modal scope? → A: the create flow is a **modal with a live card preview** and inline add/remove
  of cards; cards are also manageable (add/edit/remove) from the account detail.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Create an account via a modal with live preview (Priority: P1)

A user clicks "new account", a modal opens with a card-style preview that updates live as they fill
type, bank, status, initial balance, and currency; on save the account is created.

**Why this priority**: the modal + visual creation is the headline of the request.

**Independent Test**: open the modal, type the fields, see the preview reflect them, save → the
account appears in the list with the entered data.

**Acceptance Scenarios**:

1. **Given** the accounts screen, **When** the user clicks "new account", **Then** a modal opens with
   a card preview and the account fields.
2. **Given** the user edits fields, **When** typing, **Then** the preview updates live.
3. **Given** valid fields, **When** the user saves, **Then** the account is created and listed.

---

### User Story 2 - Attach cards while creating the account (Priority: P1)

Within the create modal the user adds one or more cards (name, credit/debit, expiry); for credit
cards they add per-currency limits (currency, limit, used); they can remove cards before saving.

**Why this priority**: registering cards under the account is core to the request.

**Independent Test**: in the modal add a debit card and a credit card with two currency limits, save
→ the account is created with both cards and the credit card shows its limits.

**Acceptance Scenarios**:

1. **Given** the modal, **When** the user adds a card, **Then** it appears in the modal's card list.
2. **Given** a credit card, **When** the user adds limits in different currencies, **Then** each
   `{currency, limit, used}` is captured.
3. **Given** a debit card, **When** added, **Then** no limit fields are required/shown.
4. **Given** added cards, **When** the user removes one, **Then** it is dropped before save.

---

### User Story 3 - Secure card numbers (last 4 only) (Priority: P1)

The user may type a full card number for convenience, but only the last 4 digits are sent and stored;
the rest is never transmitted, persisted, or displayed.

**Why this priority**: handling card data wrong is a security/compliance risk.

**Independent Test**: enter a full number; inspect what the client sends → only last 4 digits leave
the browser; the stored/displayed card shows only `•••• 1234`.

**Acceptance Scenarios**:

1. **Given** a full number typed, **When** the card is saved, **Then** the payload contains only the
   last 4 digits (never the full PAN).
2. **Given** a saved card, **When** displayed anywhere, **Then** only the last 4 digits are shown
   (masked), never the full number; CVV is never collected.

---

### User Story 4 - Manage cards from the account detail (Priority: P2)

From an account's detail the user can add, edit, and remove cards after creation.

**Why this priority**: cards change over time; managing them post-creation is needed but secondary to
the create flow.

**Independent Test**: open an account detail, add a card, edit it, remove it → changes persist.

**Acceptance Scenarios**:

1. **Given** an account detail, **When** the user adds/edits/removes a card, **Then** the change
   persists and the card list updates.

---

### Edge Cases

- **Last-4 derivation:** the client extracts the last 4 digits from whatever is typed (spaces removed);
  if fewer than 4 digits, validation fails clearly. The backend rejects anything longer than 4 digits.
- **Debit vs credit:** limits/used apply only to credit cards; a debit card has no limits.
- **Multiple limits same currency:** disallow duplicate currencies on one card (one limit per currency).
- **Used > limit:** allowed (over-limit can happen) but the UI may flag it; not blocked.
- **Money precision:** limits/used are decimal; no float drift; each limit is single-currency.
- **Per-user:** cards are reachable only through the owner's account; another user's ids return not-found.
- **Account deletion:** deleting an account deletes its cards (cards belong to the account), but does
  not delete transactions (those unlink, per the existing rule).
- **Expiry:** stored as month + year; past dates allowed (historical), UI may warn.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Account creation MUST happen via a modal showing a **live card-style preview** of the
  account being created (type, bank, balance, currency).
- **FR-002**: The account MUST support type `CHECKING`, `SAVINGS`, `VISTA` in the modal, plus bank
  name (institution), status (active/inactive), initial balance, and currency.
- **FR-003**: Users MUST be able to attach **0..N cards** to the account within the create modal and
  remove them before saving.
- **FR-004**: A card MUST have: name, kind (`CREDIT` | `DEBIT`), last-4 digits, and expiry (month/year).
- **FR-005**: A **credit** card MUST support one or more **limits**, each `{ currency, limit, used }`;
  a debit card has none. Duplicate currencies on one card are rejected.
- **FR-006**: The client MUST send **only the last 4 digits** of any card number; the full number MUST
  never be transmitted, stored, or displayed. CVV MUST never be collected.
- **FR-007**: The backend MUST reject a stored card number value longer than 4 digits (defense in depth)
  and only ever persist the last-4.
- **FR-008**: Cards MUST be **manageable (add/edit/remove)** from the account detail after creation.
- **FR-009**: All money (initial balance, limits, used) MUST use decimal precision (no floats).
- **FR-010**: All access MUST be scoped to the authenticated user; cards are reached via the owner's
  account; another user's account/card id returns not-found.
- **FR-011**: All new labels (account type incl. vista, card kind, limit/used, expiry, actions) MUST
  exist in es and en.
- **FR-012**: The modal and card UI MUST use the design system (modal/dialog, card preview, fields,
  badges, states).
- **FR-013**: Displayed cards MUST be masked as `•••• <last4>`.

### Key Entities

- **Account** (existing, extended): gains `VISTA` as an offered type; otherwise as in feature 003.
- **Card** (new): belongs to one Account (and the user); fields: name, `kind` (CREDIT|DEBIT),
  `last4` (exactly 4 digits), `expiryMonth` (1–12), `expiryYear`; relation to its limits.
- **Card limit** (new): belongs to a Card; `{ currency, limit (decimal), used (decimal) }`; only for
  credit cards; unique per currency within a card.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user creates an account through the modal and sees a live preview reflecting their input.
- **SC-002**: A user attaches multiple cards (credit + debit) in the modal; the credit card persists
  multiple per-currency limits with used amounts.
- **SC-003**: For any card number entered, the network payload contains **only the last 4 digits**
  (0 occurrences of the full PAN), and the UI shows only `•••• 1234`.
- **SC-004**: A user can add/edit/remove cards from the account detail; changes persist.
- **SC-005**: Money values (balance, limits, used) are exact to the schema precision.
- **SC-006**: 100% of new labels render in es and en.
- **SC-007**: A user cannot access another user's account or card (scoped); 404 otherwise.
- **SC-008**: All new UI uses design-system primitives (dialog/modal, card preview, fields, badges).

## Assumptions

- Extends the `accounts` domain (api + web) from feature 003; introduces `Card` + `CardLimit` entities
  related to `BankAccount` (cards `onDelete: Cascade` with the account).
- `VISTA` is added to the existing `AccountType`; legacy values stay for back-compat (not offered).
- Card number security: last-4 derivation happens client-side; the full PAN never leaves the browser;
  no CVV is collected or stored. This is a deliberate, non-negotiable security rule.
- Expiry is month (1–12) + year; validation warns on past dates but allows them.
- Money crosses the boundary as decimal strings (existing convention); limits are single-currency each.
- A modal/dialog primitive is added to the design system (Radix dialog or equivalent) in planning.

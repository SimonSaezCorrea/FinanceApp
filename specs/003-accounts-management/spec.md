# Feature Specification: Accounts Management

**Feature Branch**: `003-accounts-management`

**Created**: 2026-06-14

**Status**: Draft

**Input**: User description: "Enable the full Accounts section: create accounts (banks, cards, cash) with type, institution, currency, manual initial balance, and active/inactive status; list with a status filter; view detail; edit; activate/deactivate; delete; and reconcile the balance from linked transactions."

## Overview

The Accounts section becomes a complete management surface. A user models their real financial
accounts — **bank accounts, cards, cash** — each with a **type**, **status** (active/inactive), and
a balance that is set initially by the user and **reconciled** against the account's recorded
transactions. Builds on the existing `accounts` domain (backend + frontend) and the design system.

## Clarifications

### Session 2026-06-14

- Q: How is account type modeled? → A: a single `type` enum — `CHECKING`, `SAVINGS`, `CREDIT_CARD`,
  `DEBIT_CARD`, `CASH`, `OTHER`.
- Q: What does "inactive" do? → A: it's a **visual status badge**, not auto-hidden; the list offers a
  **filter** (all / active / inactive). Inactive accounts remain visible and counted unless filtered out.
- Q: How is the balance handled? → A: the user sets an **initial balance** manually; the **current
  balance is reconciled** = initial balance + net of linked transactions (income − expense).
- Q: Scope? → A: full CRUD + status toggle + **balance reconciliation** from transactions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create & list accounts (Priority: P1)

A user creates accounts of different types (e.g. a checking account, a credit card, cash) with a
name, institution, currency, initial balance, and status; the accounts appear in a list showing
type, status, and balance.

**Why this priority**: without create + list there is no feature; this is the core.

**Independent Test**: create one account of each type → all appear in the list with correct type
label, status badge, and balance.

**Acceptance Scenarios**:

1. **Given** the create form, **When** the user submits name + type + currency + initial balance,
   **Then** the account is created (default status active) and shown in the list.
2. **Given** several accounts, **When** the list loads, **Then** each shows its type, status badge,
   and balance; empty/loading/error states render appropriately.

---

### User Story 2 - View, edit, delete (Priority: P1)

A user opens an account's detail, edits any field, or deletes the account.

**Why this priority**: managing existing accounts is essential to the section.

**Independent Test**: open an account → see its details; edit a field → change persists; delete →
the account is removed from the list.

**Acceptance Scenarios**:

1. **Given** an account, **When** the user opens its detail, **Then** all fields are shown.
2. **Given** the edit form, **When** a field is changed and saved, **Then** the change persists.
3. **Given** an account, **When** the user deletes it (with confirmation), **Then** it is removed.

---

### User Story 3 - Status: activate/deactivate + filter (Priority: P2)

A user toggles an account between active and inactive, and filters the list by all / active /
inactive. Status is a visual badge, not an auto-hide.

**Why this priority**: lets users keep old/closed accounts without clutter, while retaining history.

**Independent Test**: deactivate an account → its badge changes to inactive; set the filter to
"active" → it disappears from the filtered view; set "all" → it reappears.

**Acceptance Scenarios**:

1. **Given** an active account, **When** the user deactivates it, **Then** its status badge shows inactive.
2. **Given** mixed statuses, **When** the filter is "active"/"inactive"/"all", **Then** the list shows
   the matching accounts.

---

### User Story 4 - Reconcile balance from transactions (Priority: P2)

A user sees each account's current balance reflect its initial balance plus the net of its linked
transactions (income − expense), and can refresh the reconciliation.

**Why this priority**: keeps balances meaningful and trustworthy as transactions accrue.

**Independent Test**: set an initial balance, add (existing) linked income/expense transactions,
trigger reconciliation → the current balance equals initial + income − expense, to the cent.

**Acceptance Scenarios**:

1. **Given** an account with an initial balance and linked transactions, **When** reconciliation runs,
   **Then** the current balance = initial + Σ(income) − Σ(expense), exact to the schema precision.
2. **Given** no linked transactions, **When** reconciliation runs, **Then** the current balance equals
   the initial balance.

---

### Edge Cases

- **Type label i18n:** every `type` value and `status` has an es/en label; an unknown/legacy value
  degrades gracefully.
- **Delete with linked transactions:** deleting an account must define what happens to its
  transactions (they are unlinked, not deleted — accounts don't own transactions).
- **Currency:** balance and reconciliation are within a single account currency; no cross-currency math.
- **Reconciliation precision:** sums use decimal precision; no float drift.
- **Per-user:** a user can only see/edit/delete/reconcile their own accounts; others' IDs return not-found.
- **Inactive accounts:** still reconcilable and editable; "inactive" is status only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to create an account with: name, `type`
  (CHECKING/SAVINGS/CREDIT_CARD/DEBIT_CARD/CASH/OTHER), optional institution, currency, an initial
  balance, and status (default active).
- **FR-002**: Users MUST be able to list their accounts showing type, status badge, and balance,
  with a status **filter** (all / active / inactive).
- **FR-003**: Users MUST be able to view an account's detail.
- **FR-004**: Users MUST be able to edit any account field.
- **FR-005**: Users MUST be able to toggle status active⇄inactive.
- **FR-006**: Users MUST be able to delete an account (with confirmation); its linked transactions
  are **unlinked**, not deleted.
- **FR-007**: The system MUST compute a **reconciled current balance** = initial balance +
  Σ(linked INCOME) − Σ(linked EXPENSE), and let the user refresh it.
- **FR-008**: All amounts MUST use decimal precision (no floats); balances respect the schema scale.
- **FR-009**: All access MUST be scoped to the authenticated user (per-user isolation); another
  user's account ID returns not-found.
- **FR-010**: All new UI labels (types, statuses, actions, filter) MUST exist in es and en.
- **FR-011**: The UI MUST use the design system (page header, form fields, card/table, badges for
  status/type, empty/loading/error states).
- **FR-012**: Status is a **visual label with filtering**, NOT auto-hiding; inactive accounts remain
  in "all" views and in totals unless the user filters them out.

### Key Entities

- **Account** (extends today's BankAccount): name, **type** (enum), institution?, currency,
  **initialBalance** (user-set), **currentBalance** (reconciled/cached), **status** (active/inactive),
  owner (userId), timestamps. Linked to its Transactions by account id.
- **Account type**: enumerated category (checking, savings, credit card, debit card, cash, other).
- **Account status**: active | inactive.
- **Transaction** (existing, read-only here): contributes INCOME/EXPENSE amounts to reconciliation
  via its `bankAccountId` link.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create an account of each of the 6 types and see it listed with the correct
  type label, status badge, and balance.
- **SC-002**: A user can view, edit (any field), and delete an account; changes persist and deletion
  removes it while leaving its transactions intact (unlinked).
- **SC-003**: A user can toggle status and filter the list by all/active/inactive with correct results.
- **SC-004**: After reconciliation, current balance = initial + Σ(income) − Σ(expense) **exact to the
  cent** for any set of linked transactions.
- **SC-005**: 100% of new labels render in both es and en.
- **SC-006**: A user never sees or affects another user's accounts (verified by scoping).
- **SC-007**: All account screens use the design system primitives/states; no ad-hoc styles.

## Assumptions

- Extends the existing `accounts` domain (backend `apps/api/src/domains/accounts`, frontend
  `apps/web/src/domains/accounts`) and the `BankAccount` model; this adds `type`, `status`, and an
  initial-vs-current balance distinction (exact field model decided in planning).
- Reconciliation reads existing `Transaction` rows linked by `bankAccountId`; it does not create or
  edit transactions.
- Single-currency per account; no currency conversion.
- Deleting an account unlinks its transactions (sets their account reference to none), consistent
  with the current relation (accounts don't own transactions).
- Money stays as decimal strings across the API boundary (existing convention).

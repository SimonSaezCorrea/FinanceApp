# FinanceApp — Banking Logic (Accounts, Cards, Credit & Transactions)

> Spanish version: [../spanish/BANKING_LOGIC.md](../spanish/BANKING_LOGIC.md)

Status: **current**. This is a narrative reference for the **accounts / cards / credit-pool /
transactions** domain logic — the rules are scattered across `CLAUDE.md` (terse, one paragraph per
domain) and the constitution's amendment history (`.specify/memory/constitution.md`, changelog-style);
this document exists to explain them in one place, with worked examples. For folder structure see
[ARCHITECTURE.md](./ARCHITECTURE.md); for the original product vision see
[APP_CONTEXT_AND_HISTORY.md](./APP_CONTEXT_AND_HISTORY.md).

**Last revised:** 2026-07-19

---

## 1. The mental model in one paragraph

A **`BankAccount`** is "where money or a credit line lives" — a checking account, a savings
account, a standalone credit card, cash, etc. A **`CardAccount`** is the physical/digital
**payment instrument** (the plastic) that draws on an account; an account can have zero, one, or
several cards. Every **`Transaction`** (income or expense) is linked to exactly one account and,
optionally, one card. Everything below flows from those three models and one governing idea: **a
credit pool belongs to the account, in the account's own currency** — cards are just different ways
of drawing on it (or, optionally, on their own narrower/parallel pool).

---

## 2. Bank accounts

### 2.1 Account types

| Type          | Meaning                             | Needs `accountNumber`? | Can have cards? | Has a real cash balance? |
| ------------- | ------------------------------------ | :---------------------: | :--------------: | :------------------------: |
| `CHECKING`    | Corriente                            | ✅ required             | ✅               | ✅                          |
| `SIGHT`       | Vista / Cuenta RUT                   | ✅ required             | ✅               | ✅                          |
| `SAVINGS`     | Ahorro                               | ✅ required             | ❌               | ✅                          |
| `INVESTMENT`  | Inversiones (e.g. Fintual)            | optional                | ❌               | ✅                          |
| `CREDIT_LINE` | A standalone credit card (no bank account behind it) | optional | ✅               | ❌ (its "balance" IS the credit pool) |
| `CASH`        | Efectivo                             | optional (no institution at all) | ❌      | ✅                          |

- **`ACCOUNT_NUMBER_REQUIRED_TYPES`** = `CHECKING`/`SIGHT`/`SAVINGS` — these are deposit-taking
  types (you'd transfer money **to** them), so a real account number is mandatory. Enforced by a
  zod `.refine()` on create and a service-layer check on update (error `ACCOUNT_NUMBER_REQUIRED`).
- **`CARDABLE_ACCOUNT_TYPES`** = `CHECKING`/`SIGHT`/`CREDIT_LINE` — only these can carry a card of
  their own. `SAVINGS`/`INVESTMENT`/`CASH` never do (real-world: their funds move via transfer into
  a cardable account first). Enforced in `CardsService.create` and `AccountsService.create`'s
  inline `cards[]` path (error `ACCOUNT_CANNOT_HAVE_CARD`), mirrored in the web UI.
- **Institution kind filter:** `CHECKING`/`SIGHT`/`SAVINGS` can only link a `BANK`-kind
  institution (you can't hold a checking account at a non-bank card issuer). `INVESTMENT` and
  `CREDIT_LINE` are left unfiltered — `kind` only distinguishes banks from non-bank *card* issuers,
  and neither bucket cleanly represents an investment manager, while a credit line can legitimately
  be issued by either. `CASH` has no institution field at all.

### 2.2 Balance

- **`initialBalance`** — a one-time seed value set at account creation.
- **`currentBalance`** — the account's cached, reconciled balance:
  `currentBalance = initialBalance + Σincome − Σexpense` over every transaction linked to the
  account. Recomputed on demand via `POST /accounts/:id/reconcile` (not on every write — the
  cached value can drift until reconciled, by design, matching the "cached balance" convention
  used elsewhere in this app).
- A 30-day **`balanceSeries`** (+ `balanceChangePct`) is derived on every read for sparklines —
  it walks backwards from `currentBalance` undoing each transaction in the window.

### 2.3 Deleting an account

Deleting an account **unlinks** its transactions instead of deleting them (`onDelete: SetNull` on
`Transaction.bankAccountId`) — the transaction rows survive as orphaned history.

---

## 3. Cards

### 3.1 What a card is

A **`CardAccount`** always belongs to exactly one `BankAccount` (`onDelete: Cascade` — deleting the
account deletes its cards). Fields: `kind` (`CREDIT` / `DEBIT` / `PREPAID`), `last4` (**only the
last 4 digits are ever transmitted or stored — the full PAN never leaves the browser, and there is
no CVV field anywhere**), `expiryMonth`/`expiryYear`, `isActive`, and `isPrimary` (see below).
Display is always masked as `•••• last4`.

### 3.2 The credit-limit model: primary card mirrors the account

This is the part that changed shape several times during development (see the constitution's
amendment history for the full back-and-forth) before settling on the current design:

> **The account's credit pool is a single set of numbers
> (`creditLimit` + `creditUsedInitial`, in the account's own currency). The account's FIRST
> CREDIT-kind card is automatically marked `isPrimary` and its limit simply *is* that pool — there
> is no separate value stored for it.** Any additional CREDIT card chooses between sharing that
> same pool, or having its own independent, narrower limit.

Concretely:

- **`isPrimary`** (boolean, `@default(false)`) is assigned **automatically** — never user-toggled,
  at most one `true` per account. It's whichever CREDIT card was added first.
- The **primary's limit is the account's own `creditLimit`/`creditUsedInitial`** — editable from
  either side (the account's own edit form, or the primary card's own edit form; it's the same
  underlying database value, not two values kept in sync). The primary card itself never has a
  `CardLimit` row for the account's own currency.
- **Every CREDIT card must resolve to a determinate limit before it can be saved** (mandatory).
  Concretely:
  - The **first** CREDIT card on an account **requires** a limit amount **in the account's own
    currency** — missing or zero/negative throws `CARD_LIMIT_REQUIRED`. That amount is written
    straight into the account's `creditLimit` (and `creditUsedInitial`, if a seed baseline was
    given).
  - Every **subsequent** CREDIT card chooses, via `usesAccountPool` (boolean, default `true`):
    - `true` (default) — **shares the account pool**. No `CardLimit` row at all; its spend simply
      counts toward the same shared `creditLimit`/`creditUsed`.
    - `false` — carries **its own sub-limit** ("tope propio"): a `CardLimit` row per currency
      (`limitAmount` + `usedInitial`, with a derived `used`). Missing/empty `limits` in this case
      also throws `CARD_LIMIT_REQUIRED`. A sub-limit **in the account's own currency** can't exceed
      the account's own pool (`CARD_SUBLIMIT_EXCEEDS_ACCOUNT`) — a sub-limit in **any other
      currency** is never cross-checked against it (there is no FX conversion anywhere in this
      app, so a CLP account's pool and a card's USD sub-limit are simply unrelated numbers).

> **Creating a new `CREDIT_LINE` account doesn't require a separate "add card" step for the
> primary.** A standalone credit-line account has no real bank account behind it, so
> `AccountCreateModal`'s generic "Número de cuenta" field is replaced (for this type only) by
> "Últimos 4 dígitos" + "Vencimiento" — combined with the account's own `creditLimit`/
> `creditUsedInitial` fields (already shown for this type), the modal builds the primary
> `CreateCard` entry itself and puts it first in the submitted `cards[]`, so the backend's "first
> CREDIT card becomes primary" resolution above picks it up with no API change. The modal's
> card-drafting section is relabeled "Tarjetas adicionales" for this type and is always
> additional-only (`CardForm`'s `hasExistingPrimary` forced `true`) — editing an existing account,
> or growing an add-on card on any OTHER account type, is unaffected and still goes through the
> normal `CardsAside` → "Añadir tarjeta" flow.

### 3.3 Multiple currencies on the primary card ("otros topes")

The primary card can **also** carry `CardLimit` rows — but **only for currencies other than the
account's own** (that one, as above, stays exclusively on `BankAccount.creditLimit`, never
duplicated as a row). This lets a single card have, say, a CLP pool (the account's own, mandatory)
**and** an independent USD pool for foreign spend, at the same time. Mechanically it's the exact
same mechanism a non-primary card's "tope propio" already uses — an independent, non-cross-checked
pool per extra currency — just also available to the primary.

The account contract exposes this as a derived **`creditPools: {currency, limit, used}[]`** array:
the account's own-currency pool, plus one entry per extra currency the primary carries. A
non-primary card's own sub-limit is **not** rolled up here — it stays scoped to that card alone.

### 3.4 Worked example

Say you create a **CHECKING** account in CLP, then add a credit card to it:

| Step                                                                          | What happens                                                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 1. Create the account, add a CREDIT card "CMR Visa", set its limit to 3,000,000 CLP | This card becomes `isPrimary: true`. Its limit is written to `BankAccount.creditLimit = 3,000,000` (CLP). The card itself has `limits: []` — no row is created for it. |
| 2. On that same card, also add a 500 USD "otro tope"                          | A `CardLimit` row is created: `{cardId, currency: "USD", limitAmount: 500}`. The card's `limits` now shows that one entry. `creditPools` on the account becomes `[{CLP, 3,000,000}, {USD, 500}]`. |
| 3. Add a second CREDIT card "CMR Visa · Camila", leave `usesAccountPool: true` | It becomes an additional card, `isPrimary: false`, no `CardLimit` rows — every peso it spends counts toward the *same* 3,000,000 CLP pool as the primary. |
| 4. Add a third CREDIT card "CMR Visa · Sofía" with `usesAccountPool: false` and its own 1,000,000 CLP limit | It becomes an additional card with its **own** `CardLimit` row in CLP — capped at 1,000,000, and separately capped at ≤ the account's 3,000,000 pool. Its spend does **not** count toward the shared 3,000,000 pool at all. |
| 5. Edit the account's `creditLimit` directly (not via a card)                 | Since the primary has no stored value of its own, this simply changes the one number that exists — the primary "picks it up" automatically next time it's read. |
| 6. Spend 300,000 CLP and 400 USD on the primary card                          | Both count independently: the account's CLP pool shows `used: 300,000`; the primary's own USD `CardLimit` shows `used: 400`. Spending on the *third* card (its own CLP sub-limit) never touches either of these. |

### 3.5 Per-card usage display vs. the account's combined total

Several cards can share the exact same pool (§3.2's `usesAccountPool: true` default). Arithmetically
they show the correct number if the UI just displays `account.creditUsed` on every one of them — but
it *reads* wrong: three cards all showing the identical "1,686,470 / 3,000,000" looks like each one
individually spent that amount, when really that's the **combined** total across all three.

To fix that, each card's contract carries a derived **`ownUsed`** (moneyString): that specific
card's own Σexpense−Σincome in the account's own currency, computed the same way regardless of
whether the card shares the pool or has its own `CardLimit`. `AccountVisualCard` uses
`card.ownUsed` — not `account.creditUsed` — as a card tile's "used" figure (still against the
shared `creditLimit` as the denominator, since that ceiling really is shared). The **only** place
the fully-combined total is still shown is the account-level tile with no specific `card` (e.g. the
placeholder shown when an account has no cards, or wherever the account itself, not a card, is being
summarized) — that one continues to use `account.creditUsed`.

One asymmetry worth knowing: `ownUsed` has **no seed baseline**. The account has
`creditUsedInitial` and a card's own `CardLimit` has `usedInitial`, both letting you record
pre-existing debt that predates any transaction — but a pool-sharing card has no field to store
that in, since the seed conceptually belongs to the account as a whole, not to one specific card.
So if an account's `creditUsedInitial` is non-zero, summing every pool-sharing card's `ownUsed`
will fall short of `account.creditUsed` by exactly that seed amount — expected, not a bug.

### 3.6 The account's shared pool: persisted balance, live billing periods, real payments

**`BankAccount.creditUsed`** is a **persisted, live column** — not recomputed from transactions on
every read. It's seeded from `creditUsedInitial` at account creation, then:

- **Every EXPENSE via a pool-sharing CREDIT card** (or, on a standalone `CREDIT_LINE` account, any
  EXPENSE at all) **increments** it by the transaction amount.
- **INCOME on a standalone `CREDIT_LINE` account** (its only way to record a payment) **decrements**
  it.
- **Editing or deleting a transaction** reverts its old contribution and applies the new one (a
  net delta on the same account, or a revert+apply pair if the transaction moved to a different
  account) — see `TransactionsService.creditPoolContribution`/`validateMovement`. **Exception:**
  once a transaction's billing period is PAID, editing/deleting it never touches `creditUsed`
  again — its pool effect is already settled (see below).
- A card with its own independent `CardLimit` for that currency does **not** touch the account
  pool — its `CardLimit.used` stays derived from transactions exactly as before (unchanged, out of
  scope for this model — see §3.7).

**Billing periods (`CreditStatement`) are live, not computed after the fact.** Every contributing
transaction links, at the moment it's created, to whichever period is currently **OPEN**
(`closedAt: null`) for the account — creating one if this is the first contribution since the last
close (`TransactionsRepository.findOrCreateOpenStatement`). A transaction's link is assigned once
and never reassigned by date on edit ("se va llenando"). Three derived states (not a stored
`status` column):

- **OPEN** (`closedAt` null): still accumulating. Its displayed `amount` is **computed live** —
  the sum of every transaction currently linked to it — so adding/editing/removing a linked
  transaction updates it automatically, no manual correction ever needed while unpaid.
- **PENDING** (`closedAt` set, `paidAt` null): sealed by generation (see below), awaiting payment.
  Amount is still live (a transaction linked to it before payment could still be edited).
- **PAID** (`paidAt` set): `amount` is **frozen** at the value it had at pay time. Only now can it
  be corrected manually (`PATCH /accounts/:id/credit-statements/:id`, `{amount}`) — no cascade to
  the linked payment transaction or to `creditUsed` (deliberate, personal-use simplification).

**Generation** (`GenerateStatementsHandler`/`GenerateAllDueStatementsHandler`,
`apps/api/src/domains/accounts/application/commands/generate-statements.handler.ts` — the
`closeIfDue` helper they share ports over the pre-migration `BillingGenerationService` one-for-one)
closes the OPEN statement once `BillingSettings.billingCycleDay` (`1`-`28`) passes since it started
— but only if the account (and its relevant credit card) is still `ACTIVE`; otherwise it's left
open indefinitely ("se dejan de generar si la cuenta o la tarjeta está inactiva"), and if no
statement was ever opened (no usage at all), there's nothing to close ("si no hubo uso, no se
genera"). Two triggers share this exact logic: a **daily cron**
(`src/infra/cron/billing-generation.cron.ts`, `@nestjs/schedule`, 3am) across every user's due
accounts, and a **manual "Generar facturación" button** (`POST /accounts/:id/generate-statements`)
scoped to one account.

**Paying** (`POST /accounts/:id/credit-statements/:id/pay`, `{fromAccountId}`) requires choosing a
real bank account (any type except `CREDIT_LINE`) — atomically: creates a normal EXPENSE
`Transaction` on that account (visible in its own Movimientos, same as any other expense — its
`currentBalance` only reflects after "Reconciliar saldo", same as everywhere else in the app, not
a special case), decrements the credit account's `creditUsed` by the statement's amount (its
snapshot at pay time, not a full reset — if new purchases happened after the period closed, they
belong to the NEXT (new) open period and `creditUsed` still reflects them, leaving a remainder
> 0 after paying), and freezes the statement as PAID.

`BankAccount.paymentMethod` (`MANUAL` default, or `AUTOMATIC`) records the user's stated
preference; `AUTOMATIC` is **locked in the UI** (can't be selected) — see `docs/PENDING.md`.

### 3.7 What's NOT modeled

- No FX conversion anywhere — a limit in one currency is never converted to compare against a
  limit in another. Extra-currency pools are simply parallel, independent numbers.
- A card's own sub-limit in a currency **other than** the account's own is never cross-checked
  against the account pool (only same-currency sub-limits are, via `CARD_SUBLIMIT_EXCEEDS_ACCOUNT`).
- Deactivating/removing a card doesn't reassign `isPrimary` to another card automatically — there
  is currently no "promote a new primary" flow if the primary is deleted.
- No way to record "a payment toward this specific add-on credit card" separately from ordinary
  account income, for a non-`CREDIT_LINE` account (see §4.2) — income never carries a card at all.
- A card's own independent `CardLimit.used` is **not** part of the billing-period model in §3.6 —
  it's still derived from transactions the old way (all-time, no periods, no payment action).
- `AUTOMATIC` payment method and "fecha de pago" (a statement due date, separate from
  `billingCycleDay`) are both unimplemented/locked — see `docs/PENDING.md`.
- No retroactive multi-period catch-up: if the cron is down for a long time, generation closes only
  the single most-recent due boundary with whatever accumulated, rather than splitting into several
  historical periods.

---

## 4. Transactions

### 4.1 Movement rules

Every transaction (`INCOME` | `EXPENSE`) links to a `bankAccountId` and, optionally, a `cardId`.
Rules, evaluated in `TransactionsService.validateMovement`:

| Scenario                                        | Rule                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `INCOME`                                          | Never carries a card (`CARD_NOT_ALLOWED` if one is given).             |
| `EXPENSE` on a `CASH` account                      | Never carries a card either.                                           |
| `EXPENSE` on a `CREDIT_LINE` account               | **Must** carry a card belonging to that account (`CARD_REQUIRED` if missing, `CARD_ACCOUNT_MISMATCH` if it belongs to a different account). |
| `EXPENSE` on any other non-cash account            | A card is optional; if given, it must belong to the account.           |
| Whenever the card used is **CREDIT**-kind (on a `CREDIT_LINE` account, or any other account that's grown one) | The amount is checked against **both** the account's shared pool **and**, if that card carries its own `CardLimit` for the transaction's currency, that narrower sub-limit too. |

### 4.2 Credit-pool enforcement

Two independent checks run for a CREDIT-card expense, both currency-scoped and both respecting the
account's billing cycle (§3.6, if one is configured):

- **`assertWithinCreditPool`** — `creditUsed = creditUsedInitial + Σexpense − Σincome` (summed
  **only** over transactions in the **account's own currency**, since the start of the current
  billing cycle if one is set, and **excluding** any card that carries its own `CardLimit` **for
  that same currency** — a card can share the pool for its own currency while being independently
  limited in another). If `used + amount > creditLimit`, throws `CARD_LIMIT_EXCEEDED`.
- **`assertWithinCardLimit`** — if the specific card has a `CardLimit` row for the transaction's
  **own currency**, the same math (same billing-cycle window) is repeated scoped to just that
  card+currency. If exceeded, throws `CARD_SUBLIMIT_EXCEEDED`.

Both are independent — a transaction can fail either one regardless of the other (e.g. staying
under a card's own USD sub-limit doesn't matter if a *different*, unrelated CLP transaction pushes
the shared CLP pool over its limit).

> **Why "currency-scoped" is called out explicitly:** earlier revisions of this logic summed a
> card's spend without checking currency at all, and excluded a card from the shared-pool sum if it
> had *any* `CardLimit` row, regardless of currency. That was harmless as long as a card's
> `CardLimit` rows always meant "fully independent, single currency" — but it became a real bug the
> moment a single card could share the pool in one currency while being independently limited in
> another (exactly the primary-card multi-currency case above): the card's other-currency spend
> would have inflated the account's own-currency `creditUsed`. Both sums are now scoped per-currency.

> **A second, separate correctness fix (shipped alongside billing cycles):** for a standalone
> `CREDIT_LINE` account, summing *every* transaction on it toward the credit pool is correct by
> construction — an EXPENSE there always carries a CREDIT card, an INCOME is a payment, there's
> nothing else it could be. But for any OTHER account type that's merely grown an add-on credit
> card, that same "sum everything" query used to also sweep up ordinary day-to-day banking — debit-
> card purchases, cash-like expenses, salary/other income — none of which has anything to do with
> the credit line. In the worst observed case this drove a displayed `creditUsed` to a large
> negative percentage on a checking account with substantial unrelated income (the income was being
> subtracted as if it were a credit-card payment). Fixed by requiring, for non-`CREDIT_LINE`
> accounts, that only EXPENSE via a pool-sharing CREDIT-kind card counts — income is never
> subtracted for this case, since there's no way today to record "a payment toward this specific
> add-on card" apart from ordinary account income (income never carries a card at all).

### 4.3 Category & other fields

Transactions also carry free-text `category`, `description`, `observation`, `emisor`/`receptor`
(counterparty), and `lugar` (place) — these are informational only and don't participate in any of
the validation above.

---

## 5. Error codes glossary (this domain)

| Code                            | Thrown when…                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `ACCOUNT_NUMBER_REQUIRED`        | Creating/updating a CHECKING/SIGHT/SAVINGS account with no `accountNumber`.                        |
| `ACCOUNT_CANNOT_HAVE_CARD`       | Adding a card (nested or inline) to a SAVINGS/INVESTMENT/CASH account.                              |
| `CARD_REQUIRED`                  | An EXPENSE on a CREDIT_LINE account with no `cardId`.                                               |
| `CARD_NOT_ALLOWED`               | A card given on an INCOME, or on a CASH-account EXPENSE.                                            |
| `CARD_ACCOUNT_MISMATCH`          | The given `cardId` doesn't belong to the given `bankAccountId`.                                     |
| `CARD_LIMIT_REQUIRED`            | A CREDIT card (becoming primary, or additional with `usesAccountPool: false`) has no valid limit.  |
| `CARD_LIMIT_EXCEEDED`            | A transaction would push the account's shared pool (in its own currency) over `creditLimit`.       |
| `CARD_SUBLIMIT_EXCEEDED`         | A transaction would push a card's own `CardLimit` (same currency) over its `limitAmount`.           |
| `CARD_SUBLIMIT_EXCEEDS_ACCOUNT`  | Setting a card's own sub-limit, in the account's own currency, higher than the account's pool.     |
| `CARD_NOT_FOUND`                 | Editing/removing/reading a card that doesn't exist (or isn't the user's).                          |

---

## 6. Quick code-path references

**Amendment (2026-07-25, DDD + CQRS migration — specs/009):** `accounts` was the reference domain
for the DDD + CQRS migration. Its old flat `accounts.service.ts`/`accounts.repository.ts`/
`cards.service.ts`/`cards.repository.ts`/`billing-generation.service.ts` are retired; the SAME
business rules described in this document now live in the four-layer structure below. See
`docs/{english,spanish}/ARCHITECTURE.md` for the full pattern and
`specs/009-ddd-cqrs-architecture/` for the migration's spec/plan/tasks.

| Concept                                          | Backend location                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| Account types, cardable/institution-kind helpers    | `packages/contracts/src/accounts/index.ts`                                       |
| Account invariants (cardable, `ACCOUNT_NUMBER_REQUIRED`, credit-pool projection) | `apps/api/src/domains/accounts/domain/bank-account.aggregate.ts` (`BankAccount`) |
| Card CRUD + primary/mandatory-limit resolution      | `BankAccount.resolveCardPlacement`/`planCreation` (same aggregate file)          |
| `CreditStatement` lifecycle (OPEN/PENDING/PAID) | `apps/api/src/domains/accounts/domain/credit-statement.aggregate.ts` + `domain/states/*.ts` (State pattern) |
| Billing eligibility (CREDIT_LINE vs. add-on card)   | `apps/api/src/domains/accounts/domain/billing-eligibility.strategy.ts` (Strategy pattern) |
| Derived `creditPools`/`Card.ownUsed` (read shaping) | `apps/api/src/domains/accounts/application/queries/account-dto.mapper.ts`        |
| Pay/generate/correct commands                       | `apps/api/src/domains/accounts/application/commands/{pay-credit-statement,generate-statements,correct-statement-amount}.handler.ts` |
| List/get queries                                    | `apps/api/src/domains/accounts/application/queries/{list-accounts,get-account,list-credit-statements}.handler.ts` |
| Prisma adapters (only files allowed to import `@prisma/client` in this domain) | `apps/api/src/domains/accounts/infrastructure/prisma-{bank-account,credit-statement}.repository.ts` |
| Facade controller                                   | `apps/api/src/domains/accounts/presentation/accounts.controller.ts`             |
| Transaction movement rules + credit enforcement     | `apps/api/src/domains/transactions/domain/movement-policy.ts` + `domain/transaction.aggregate.ts`, applied by `application/commands/*.handler.ts` |
| Persisted `creditUsed` mutation on tx create/update/delete | `TransactionsService.creditPoolContribution`/`validateMovement`, `TransactionsRepository.adjustCreditUsed` |
| Card-own-sub-limit sums (still derived, unchanged)  | `TransactionsRepository.sumsForCard`, `PrismaBankAccountRepository.cardSums`     |
| Pay down the account's credit pool + payment history | `PayCreditStatementHandler`, `POST /accounts/:id/credit-statements/:id/pay`, `GET .../credit-statements` |
| Billing-cycle day (informational only)              | `apps/api/src/domains/accounts/domain/billing-cycle.ts` (`currentCycleStart`, no longer used to scope any sum) |

| Concept                                          | Frontend location                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| 3-state card form (none / primary / additional)     | `apps/web/src/domains/accounts/components/CardForm.tsx`                          |
| Account create/edit forms (mirrored, read-only cupo, billing day) | `AccountCreateModal.tsx`, `AccountForm.tsx`                        |
| Card tiles + Principal/Adicional badge + per-card `ownUsed` display | `AccountVisualCard.tsx`, `DraftCardTile.tsx`                     |
| Enlarged single-card view + extra-currency pools    | `CardDetailModal.tsx`                                                            |
| Account-level "topes por moneda" list               | `AccountDetailRoute.tsx`                                                         |

---

_End of document._

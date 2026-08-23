# Data Model: Facturación de compras en cuotas con tarjeta de crédito

**Feature**: 014-installment-credit-billing | **Date**: 2026-08-22

One new column. No new tables. No migration (`pnpm db:push` + `pnpm db:seed`).

---

## Schema changes

### `installment-payment` — one new column

```prisma
model InstallmentPayment {
  // ... existing fields unchanged ...

  /// The billing period that charged this instalment (FR-008/FR-009).
  /// NULL = not yet billed. SetNull, never Cascade: deleting a period must
  /// never delete a row of the plan's schedule.
  creditStatementId String?
  creditStatement   CreditStatement? @relation(fields: [creditStatementId], references: [id], onDelete: SetNull)

  @@index([creditStatementId])
}
```

`CreditStatement` gains the inverse relation field only (no column of its own).

**Why a column and not a derivation**: billing periods are created lazily — a month with no
card activity produces no period at all, so the sequence of `[periodStart, closedAt)`
windows has gaps. Deriving "billed" from dates would let an instalment falling in a gap be
either missed or double-charged. See `research.md` R2.

**Index**: `creditStatementId` is the access path for "which instalments did this period
charge" — needed on every statement read (breakdown) and on every payment (settling them).

---

## Derived values (stored nowhere)

### Instalment status — three situations (FR-018)

| Status      | Condition                                       | Meaning                              |
| ----------- | ----------------------------------------------- | ------------------------------------ |
| `SCHEDULED` | `creditStatementId === null && paidAt === null` | in the calendar, not charged yet     |
| `BILLED`    | `creditStatementId !== null && paidAt === null` | charged in a period awaiting payment |
| `PAID`      | `paidAt !== null`                               | settled                              |

`BILLED` only ever occurs on credit-card plans. On every other plan an instalment goes
`SCHEDULED → PAID` directly, exactly as today — which is what keeps FR-005 testable.

**Ordering matters**: `paidAt` is checked first. An instalment of a settled period is PAID
even though it still carries its `creditStatementId` (that link is what FR-020 needs to
reach the settling period).

### Plan counters (FR-019)

`scheduledCount` / `billedCount` / `paidCount`, derived by counting the plan's rows by the
table above. They always sum to `installmentCount`.

### `PlanBillingWarning` (FR-009a, FR-023a)

A nullable reason string on the plan DTO, or `null` when nothing is wrong:

- `NO_BILLING_DAY` — the card's account has no `billingCycleDay`, so no period will ever
  close and no instalment will ever be charged.
- `CURRENCY_MISMATCH` — the plan's currency differs from the card account's, so its
  instalments cannot be billed without an exchange rate the app does not have.

Derived on read, never stored: both conditions can be fixed elsewhere (configure the day,
or the plan simply stays as it is) and a stored copy would go stale silently.

---

## Statement total — recomposed (FR-010)

Today:

```
total = sum(linked transactions) + carriedOverAmount
```

After:

```
total = sum(linked transactions, EXCLUDING those with installmentPlanId)
      + carriedOverAmount
      + sum(instalments stamped with this statement's id)
```

The exclusion is the load-bearing part: the purchase movement of a plan carries
`installmentPlanId`, sits on the credit account, and would otherwise be linked to whatever
period was open — billing the full purchase in one month, which is precisely the defect
being removed (FR-007).

### Breakdown (FR-011)

`purchases` and `installments` now come from **two disjoint sources** rather than one being
the remainder of the other:

- `purchases` = the linked-transactions sum (already excluding `installmentPlanId` rows)
- `installments` = the stamped-instalments sum; `installmentCount` = how many
- `carriedOverAmount` remains reported on its own, as today

---

## State transitions

### An instalment (credit-card plan)

```
SCHEDULED ──[ period closes; dueDate <= closedAt ]──▶ BILLED ──[ period settles ]──▶ PAID
```

Both transitions are driven by the **period**, never by the user. There is no action on an
instalment of a credit-card plan (FR-021).

Guards:

- Stamping selects `creditStatementId IS NULL AND dueDate <= closedAt` — idempotent, so a
  re-run or a retry cannot double-charge (FR-009).
- Stamping is scoped to plans whose `cardId` belongs to **this** account (FR-008).
- Stamping skips instalments whose plan currency ≠ account currency (FR-009a).
- Settling stamps `paidAt` on every instalment of the period regardless of whether the
  payment covered the total — the shortfall is the period's carry-over, not the
  instalment's (FR-014/FR-015).

### An instalment (every other plan) — unchanged

```
SCHEDULED ──[ user pays it from an account ]──▶ PAID
```

### A plan

Two irreversibility points, both invariants of the `InstallmentPlan` aggregate:

| From                                   | Trigger | Effect                                                                       |
| -------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| any instalment `BILLED` or `PAID`      | —       | `totalPrincipal`, `installmentCount`, `startDate`, `cardId` frozen (FR-006b) |
| any instalment on a **settled** period | —       | plan can no longer be deleted (FR-006a)                                      |

The second is strictly narrower than the first: a plan whose instalments are all merely
BILLED can still be deleted, because unwinding a PENDING period touches no real payment.

---

## Movements

No schema change. One new role for an existing shape:

| Movement                                      | `installmentPlanId` | `cardId`        | `financeCharge` | Bills in its period?       | Consumes pool? |
| --------------------------------------------- | ------------------- | --------------- | --------------- | -------------------------- | -------------- |
| **Plan purchase** (new)                       | set                 | the plan's card | false           | **no**                     | yes, in full   |
| Interest charge (exists)                      | **null**            | null            | true            | yes                        | yes            |
| Instalment payment (exists, non-credit plans) | set                 | null            | false           | n/a (not a credit account) | no             |
| Ordinary purchase                             | null                | any             | false           | yes                        | yes            |

The interest charge deliberately keeps `installmentPlanId` null so it stays an ordinary
period charge (`research.md` R4). Row 1 and row 3 both carry `installmentPlanId` but can
never coexist on one plan: a credit-card plan has no instalment payments (FR-021), and a
non-credit plan has no purchase movement (FR-005).

---

## New error codes

| Code                       | Status | Raised when                                                                         |
| -------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `INSTALLMENT_PLAN_BILLED`  | 409    | editing a commitment-defining field after the first instalment was billed (FR-006b) |
| `INSTALLMENT_PLAN_SETTLED` | 409    | deleting a plan with an instalment on a settled period (FR-006a)                    |

`TRANSACTION_LINKED_TO_INSTALLMENT` (existing, 409) is reused for FR-024: the purchase
movement cannot be edited or deleted from the Movements view. Its current lookup asks
whether the transaction backs an instalment _payment_; it must be widened to also match a
transaction carrying `installmentPlanId`.

---

## Data migration

**None.** Development data, regenerated with `pnpm db:push && pnpm db:seed` — the same call
made by specs/011 and by the cash-vs-credit change.

Plans created before this feature have no purchase movement and no billed instalments. They
are not repaired: the seed is rewritten instead, and must cover the new shape end to end —
a credit-card plan with its purchase movement, several billed instalments, and at least one
period settled with a shortfall (the FR-020 display case).

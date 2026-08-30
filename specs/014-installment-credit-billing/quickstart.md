# Quickstart: validating 014 — facturación de cuotas con tarjeta de crédito

**Feature**: 014-installment-credit-billing | **Date**: 2026-08-22

How to prove the feature works end to end. Details of shapes and rules live in
[data-model.md](./data-model.md) and [contracts/installments.md](./contracts/installments.md).

---

## Prerequisites

```bash
pnpm install
pnpm --filter @finance/api exec prisma generate
pnpm db:push            # no migration: the new column is added by push
pnpm db:seed            # regenerates data under the new model
pnpm dev                # api on :3001, web on :5173
```

Demo login: `test@finance.local` / `demo1234`.

Docker is required only for `pnpm db:reset` (full teardown). `db:push` alone is enough here.

---

## Automated gates

```bash
pnpm --filter @finance/contracts test        # instalment status + plan counters
pnpm --filter @finance/api test:unit         # aggregates, stamping selection, totals — zero DB
pnpm --filter @finance/api test:integration  # close→stamp transaction + rollback (needs DB)
pnpm --filter @finance/api test:e2e          # the full life of a plan (SC-003)
pnpm --filter @finance/web test              # plan row counters, absent pay action
pnpm typecheck && pnpm check:boundaries
```

Scoped runs, not the whole suite — the repo has 500+ tests and a full run blocks.

---

## Scenario A — the pool reflects the commitment (US1, SC-001)

1. Open the seeded credit-card account. Note **cupo disponible**.
2. Cuotas → create a plan: 1.080.000, 12 instalments, that account's card.
3. The account's available credit dropped by **1.080.000**, immediately.
4. Movimientos, filtered by that card → one purchase movement for 1.080.000, dated the
   plan's start.

**Fails if**: available credit is unchanged (no purchase movement created), or dropped by
one instalment (the movement was created for the wrong amount).

### A2 — the other plans are untouched (FR-005)

Create a plan with a **debit** card. No purchase movement, no pool movement, and its
detail still offers "Pagar cuota". This is the regression that matters most: the feature
must be invisible to every non-credit-card plan.

---

## Scenario B — one instalment per period (US2, SC-002, SC-005)

1. Ensure the account has a `billingCycleDay` configured.
2. Account detail → Facturación → **Generar facturación**.
3. The period's total includes **90.000** of instalments, not 1.080.000.
4. Its breakdown separates purchases from instalments and reports `installmentCount: 1`.
5. Cuotas → the plan shows one instalment as **facturada**.
6. Generate again for the next period → instalment 2 is charged, **instalment 1 is not
   charged again**.

**Fails if**: the period totals 1.080.000 (the purchase movement was not excluded), or
`installments` is still `"0"` (the breakdown was not rewired), or instalment 1 appears in
two periods (the stamping guard is not idempotent).

### B2 — the gap case (FR-009, the reason the column exists)

1. Let a whole billing cycle pass with **no** card activity, so no period is generated.
2. Generate the following period.
3. The instalment that fell in the gap is charged **exactly once** — not lost, not doubled
   up with the next one.

This is the scenario that a date-window derivation fails. If it passes, R2's decision is
justified.

### B3 — the plan switches itself off (FR-013)

After instalment 12 is billed, generate further periods. The plan contributes **nothing**.

### B4 — reconciliation preserves instalments (FR-012)

On a period that charged instalments, run **Sincronizar pagos**. The total still includes
them.

---

## Scenario C — paying settles the instalments (US3, SC-004)

1. On a period charging one instalment (90.000) plus an ordinary purchase (40.000), pay
   the **full** 130.000.
2. Cuotas → that instalment is **pagada**, with no action taken on the plan itself.
3. The account's available credit rose by exactly 130.000 — **not** by 220.000 (which
   would mean the instalment was discounted twice).

### C2 — a short payment also settles it (FR-014/FR-015, the subtle one)

1. On the same shape of period, pay **100.000** of 130.000.
2. The instalment is **pagada** — not left owing.
3. The plan's row says the settling period was paid only in part, and links to it.
4. The next period carries **30.000** forward.
5. The instalment's own carry-over is **0**: the shortfall lives in the period, never in
   both places.

**Fails if**: the instalment stays unpaid (the debt is now counted twice — in the
successor's carry-over and in the plan), or the plan says a flat "pagada" with no
indication that the period fell short.

### C3 — correcting the payment leaves instalments alone (FR-017)

Use "Modificar pago" on that period. The instalments' status does not change.

---

## Scenario D — what the plan shows (US4, SC-006, SC-007)

1. A 12-instalment plan with 5 paid, 1 billed, 6 scheduled shows all three counts **in the
   list**, without opening the detail.
2. Its detail offers **no** "Pagar cuota", and explains that these instalments settle when
   the card's statement is paid.
3. A debit-card plan's detail still offers it.

**SC-007 check**: there is no button anywhere on a credit-card plan that, when clicked,
changes no money.

---

## Scenario E — the refusals (FR-006a, FR-006b, FR-024)

| Attempt                                                                               | Expected                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Edit amount / instalment count / start date / card of a plan with a billed instalment | refused, `INSTALLMENT_PLAN_BILLED`; title, category and notes still save              |
| Delete a plan whose instalment sits on a **settled** period                           | refused, `INSTALLMENT_PLAN_SETTLED`                                                   |
| Delete a plan whose instalments are only **billed** (period still pending)            | allowed; purchase movement and pool reverted, and the confirmation said so beforehand |
| Delete the purchase movement from Movimientos                                         | refused, `TRANSACTION_LINKED_TO_INSTALLMENT`, with a link to Cuotas                   |

---

## Scenario F — the warnings (FR-009a, FR-023a)

| Setup                                      | Expected                                                        |
| ------------------------------------------ | --------------------------------------------------------------- |
| Card account with **no** `billingCycleDay` | the plan warns and links to the billing configuration           |
| Plan in USD on a CLP card account          | the plan warns; generating a period charges **nothing** from it |

---

## What "done" looks like

Every scenario above passes, plus:

- `pnpm typecheck`, `pnpm check:boundaries`, `turbo run lint` and `pnpm format:check` clean
- es/en parity holds (`apps/web/src/i18n/parity.test.ts`) for the two new error codes, the
  three instalment statuses and the two warnings
- `.specify/memory/constitution.md` and `CLAUDE.md` updated in the same session
  (Constitution V) — the cycle is not finished until they are

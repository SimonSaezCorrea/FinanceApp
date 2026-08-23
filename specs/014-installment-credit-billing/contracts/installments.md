# Contract changes: `@finance/contracts`

**Feature**: 014-installment-credit-billing | **Date**: 2026-08-22

Additive only. No endpoint is removed and no existing field changes type, so a client that
ignores the new fields keeps working. One endpoint loses its meaning for one class of plan
(see §Removed behavior).

---

## `installments`

### `installmentPaymentSchema` — two new fields

```ts
creditStatementId: z.string().nullable(),   // the period that charged it; null = not billed
status: installmentPaymentStatus,           // derived, never sent by a client
```

```ts
export const installmentPaymentStatus = z.enum(["SCHEDULED", "BILLED", "PAID"]);
```

Derivation (single source, mirrored by the API and the web):

```ts
export function installmentStatus(p: {
  paidAt: string | null;
  creditStatementId: string | null;
}): InstallmentPaymentStatus {
  if (p.paidAt) return "PAID"; // checked FIRST — see data-model.md
  return p.creditStatementId ? "BILLED" : "SCHEDULED";
}
```

### `installmentPlanSchema` — counters and warning

```ts
scheduledCount: z.number().int(),  // instalments not yet billed
billedCount: z.number().int(),     // billed, awaiting their period's payment
paidCount: z.number().int(),       // settled
billingWarning: planBillingWarning.nullable(),
```

```ts
export const planBillingWarning = z.enum(["NO_BILLING_DAY", "CURRENCY_MISMATCH"]);
```

The three counters always sum to `installmentCount`. For a non-credit-card plan
`billedCount` is always `0` and `billingWarning` always `null`, which is the machine-checkable
form of FR-005 ("nothing changes for those plans").

### `generatesMovementOnPay` — unchanged, meaning sharpened

```ts
export function generatesMovementOnPay(cardKind: CardKind | null): boolean {
  return cardKind !== "CREDIT";
}
```

Already exists and already returns the right answer. It now also gates the pay action in the
UI (FR-021) rather than only the movement creation, so its doc comment must say so.

---

## `accounts`

### `creditStatementSchema.breakdown` — unchanged shape, real values

```ts
breakdown: z.object({
  purchases: moneyString,
  installments: moneyString,      // was always "0"; now the stamped instalments' sum
  installmentCount: z.number(),   // was always 0
}),
```

No schema change. What changes is that the two fields stop coming from one query where the
second was unreachable, and start coming from two disjoint sources (`data-model.md`
§Breakdown). Documented here because a consumer that special-cased `installments === "0"`
will now see real numbers.

---

## Errors

```ts
INSTALLMENT_PLAN_BILLED; // 409 — commitment fields frozen once billed (FR-006b)
INSTALLMENT_PLAN_SETTLED; // 409 — plan has an instalment on a settled period (FR-006a)
```

Both need `errors.<CODE>` entries in **both** `apps/web/src/i18n/es.json` and `en.json`
(Constitution III; `src/i18n/parity.test.ts` enforces it).

`TRANSACTION_LINKED_TO_INSTALLMENT` (existing) widens its trigger: it already fires for a
movement backing an instalment payment, and must now also fire for a plan's purchase
movement (FR-024). Same code, same status — the message key may need rewording to cover
both cases.

---

## Endpoints

| Method   | Path                                        | Change                                                                      |
| -------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| `POST`   | `/installments`                             | side effect only: a credit-card plan now also creates its purchase movement |
| `PATCH`  | `/installments/:id`                         | may now answer `409 INSTALLMENT_PLAN_BILLED`                                |
| `DELETE` | `/installments/:id`                         | may now answer `409 INSTALLMENT_PLAN_SETTLED`                               |
| `GET`    | `/installments`, `/installments/:id`        | responses gain the counters, warning and per-instalment status              |
| `POST`   | `/accounts/:id/generate-statements`         | side effect: stamps the period's due instalments                            |
| `POST`   | `/accounts/:id/credit-statements/:sid/pay`  | side effect: settles the period's instalments                               |
| `POST`   | `/accounts/:id/credit-statements/:sid/sync` | must preserve stamped instalments (FR-012)                                  |

**No new endpoint.** Every behavior added here is a side effect of an operation the user
already performs, which is the point: the user should not have to tell the app something it
can already tell from the period closing.

### Removed behavior

`POST /installments/:id/payments/:seq/pay` and its `unpay` twin **stay** and are unchanged
for non-credit-card plans. For a credit-card plan they must be refused — the plan already
refuses to store a `paymentAccountId` for such a plan (`INSTALLMENT_CARD_IS_CREDIT`), and
that same error is the right answer here: the endpoint stops being reachable from the UI
(FR-021), and refusing it server-side is what keeps a direct API call from creating the
double-count the whole feature exists to prevent.

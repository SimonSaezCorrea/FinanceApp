# Research: Facturación de compras en cuotas con tarjeta de crédito

**Feature**: 014-installment-credit-billing | **Date**: 2026-08-22

Phase 0 output. Every open technical question resolved against the code as it stands
today, so `plan.md` has no `NEEDS CLARIFICATION` left.

---

## R1 — Where does a period's total come from today?

**Finding**: `CreditStatement.totalFor(linkedAmount)` = `linkedAmount + carriedOverAmount`
(`credit-statement/domain/credit-statement.aggregate.ts`). The linked sum is passed IN
by the caller because, until a period settles, its amount is not stored — it is the live
sum of the transactions carrying its `creditStatementId`, produced by
`PrismaCreditStatementRepository.sumLinkedTransactions`.

**Decision**: extend the aggregate to `totalFor(linkedAmount, instalmentAmount)` — a third
explicit summand, not a fatter `linkedAmount`.

**Rationale**: the three components have different lifecycles and the DTO must report them
separately (FR-011). Folding instalments into `linkedAmount` at the call site would make
`breakdown.purchases` (computed as `total − instalments`) circular.

**Alternatives rejected**:

- _Synthesise one transaction per instalment at close time._ Would make `linkedAmount`
  carry everything and need no aggregate change — but creates 12 movements the user never
  made, and CLAUDE.md already records why the same shortcut was rejected for
  `carriedOverAmount`: "Sincronizar pagos" recomputes from real movements and would erase
  them.
- _Store the instalment total on the statement at close time._ Breaks FR-012: a
  reconciliation would have nothing to recompute it from.

---

## R2 — Why can't "billed" be derived from dates alone?

**Finding**: `closeIfDue` (`generate-statements.handler.ts`) returns early when
`findOpenForAccount` yields nothing — _"no usage since the last close -> nothing to
generate"_. A statement is only created lazily, by the first contributing movement
(`findOrCreateOpenStatement`). A month with no card activity therefore produces **no
period at all**.

**Consequence**: the sequence of periods has gaps. An instalment falling in a gap either
never gets billed, or gets swept into a much later period together with another one —
violating FR-009 (exactly once).

**Decision**: persist the link. New column `InstallmentPayment.creditStatementId`
(nullable FK → `CreditStatement`, `onDelete: SetNull`). "Billed" is
`creditStatementId !== null`; selection at close time is `dueDate <= closedAt AND
creditStatementId IS NULL`, which is idempotent by construction and gap-proof.

**Alternatives rejected**:

- _Derive by date window `[periodStart, closedAt)`._ Fails on gaps, as above.
- _A boolean `isBilled` flag._ Answers "billed?" but not "by which period", so FR-014
  (paying a period settles its instalments) and FR-020 (link to the settling period)
  would need a second mechanism.

`onDelete: SetNull` rather than `Cascade`: deleting a period must never delete the
schedule row. Mirrors the reasoning already applied to `InstallmentPlan.cardId` and
`InstallmentPayment.transactionId`.

---

## R3 — Which domain writes the new column?

**Finding**: Constitution VI — `installment-payment` owns the table but not the rules;
"writes still travel through the aggregate root that validates them", i.e.
`InstallmentPlan`. Meanwhile the write is _triggered_ from `credit-statement`'s
`closeIfDue`.

**Decision**: `credit-statement`'s generation handler orchestrates; the rule
("which instalments may be stamped, and with what") lives in the `InstallmentPlan`
aggregate as a pure function over rows. The port method that performs the write is
exposed by `installment-payment` and called inside the caller-owned `$transaction`
(`stampStatementWithTx`), exactly as `applyCarryDeltasWithTx` already is.

**Module-graph consequence (blocking, must be fixed first)**: `installment-plan` has **no
`installment-plan.data.module.ts`**. Its port→adapter binding sits inside the
orchestration module `installment-plan.module.ts`, which imports four other data modules.
`credit-statement` importing that module would pull orchestration into orchestration.

**Decision**: extract `installment-plan.data.module.ts` (binding only, importing
`InstallmentPaymentDataModule` for row loading), have `installment-plan.module.ts` import
it, and let `credit-statement.module.ts` import the leaf. This is what Constitution VI
already prescribes for every table; `installment-plan` is simply the one that never got
it. Graph stays acyclic: `credit-statement` (orchestration) → `installment-plan` (leaf) →
`installment-payment` (leaf) → nothing.

**Alternatives rejected**:

- _Let `credit-statement` write the table directly._ Two adapters on one table — the
  single rule Constitution VI exists to prevent.
- _Publish `StatementClosedEvent` and let `installment-plan` react._ Events dispatch
  synchronously but **outside** the closing `$transaction`, so a failure would leave a
  period closed with its instalments unstamped. Atomicity is required here.

---

## R4 — Does the purchase movement break existing sums?

**Finding**: `PrismaTransactionSumsRepository.breakdownForStatement` splits a period's
`EXPENSE` rows into "carries `installmentPlanId`" vs "the remainder". Today the first
bucket is unreachable (no such row can ever be linked to a period — see spec §Contexto).
`sumLinkedTransactions` sums every transaction with the period's `creditStatementId`.

**Risk**: the new purchase movement carries `installmentPlanId` AND lands on a credit
account, so `findOrCreateOpenStatement` would link it to whatever period is open,
and `sumLinkedTransactions` would bill the full 1.080.000 — the exact defect this feature
exists to remove.

**Decision**: a transaction carrying `installmentPlanId` is **excluded from
`sumLinkedTransactions`** and from `netForPeriod`. It contributes to `creditUsed` (the
pool) and to the Movements list, never to a period's total. The instalment schedule is
what a period bills.

**Consequence for the existing `breakdownForStatement`**: its "installments" bucket stops
being derived from transactions altogether and is fed by the stamped instalments instead.
The purchases bucket becomes the plain linked sum rather than a remainder — the two no
longer need to be computed as `total − installments` to stay consistent, because they now
come from two disjoint sources.

**Note on FR-004**: the existing `financeCharge` interest movement carries **no**
`installmentPlanId` today (`create-installment-plan.handler.ts` omits it). It must keep
behaving as an ordinary period charge, so it must **not** gain one. Documented as a
constraint, not a change.

---

## R5 — Does the purchase movement move the account balance?

**Finding**: `transaction/domain/balance-delta.ts` — `isChargedToCredit(account, card)`
returns true for any movement on a `CREDIT_LINE` account or through a `CREDIT` card, and
`cashDelta` returns zero for those. A credit-card account has no `currentBalance` to move.

**Decision**: nothing new needed. The purchase movement is created with the plan's card
on a `CREDIT_LINE` account, so the existing rule already routes it to `creditUsed` and
not to cash. This also means `planDeletionReversal` already classifies it correctly (it
sends credit-charged movements to `creditReversals`, cash ones to `balanceRestorations`).

---

## R6 — What does "paid in part" mean for an instalment?

**Finding**: `CreditStatement.state` returns `PartiallyPaidState` when `paidAt` is set and
`paidAmount < amount`. That state is **terminal** (`canPay()`/`canClose()` false) and the
shortfall has already moved to the successor as `carriedOverAmount`.

**Decision**: an instalment stamped onto a settled period is `paidAt`-stamped regardless of
whether the payment covered the total. Its `paidAmount` is its own scheduled amount, and
its `carriedOverAmount` stays `"0"`.

**Rationale**: the debt is in exactly one place — the successor period's carry-over.
Leaving the instalment unpaid would count it twice, which Constitution I forbids in as
many words ("a shortfall counted both on the item and on its carry is the same debt
twice"). And `carriedOverAmount` is a single undifferentiated figure, so there is no fact
of the matter about _which_ line item fell short.

**UI consequence (FR-020)**: "pagada" alone would misdescribe it. The instalment reports
the settling period's status, which the Cuotas view surfaces and links.

---

## R7 — Two carry-over levels: is that a contradiction?

**Finding**: Constitution I mandates _one_ mechanism for "what you didn't cover", and names
both `CreditStatement.carriedOverAmount` and `InstallmentPayment.carriedOverAmount`.

**Decision**: not a contradiction — one mechanism, applied at whichever level actually
receives the money. A non-credit-card plan is paid instalment by instalment, so a shortfall
carries instalment→instalment. A credit-card plan is never paid per instalment (that is
FR-021), so a shortfall carries period→period. `InstallmentPayment.carriedOverAmount` is
therefore always `"0"` for credit-card plans, and that must be documented (FR-025) or the
next reader will hunt for a shortfall in the wrong table.

**Corollary check — the "last item" rule**: Constitution I says a short payment on the last
item of a sequence does NOT settle it. For credit-card plans the sequence that receives
payments is the sequence of _periods_, not instalments, and a period always has a successor
(`findOrCreateCarryOverTargetWithTx` creates one). So the corollary is satisfied at the
level where it applies, and the last **instalment** is not a special case here.

---

## R8 — Currency

**Finding**: the app performs no FX anywhere; `sumsForAccount`/`sumsByAccount` are already
scoped to the account's own currency, and a card's extra-currency pools are deliberately
not cross-checked.

**Decision**: an instalment whose plan currency differs from the card account's currency is
**not** stamped onto any period (FR-009a), and the plan says so. Billing it would require
inventing a rate.

**Alternative rejected**: bill it at face value in the account's currency. Silently wrong by
whatever the true rate is — the worst outcome in a money app.

---

## R9 — Immutability and deletion (from `/speckit-clarify`)

**Decision**: both rules live in the `InstallmentPlan` aggregate, since both are invariants
of the plan and must be impossible to bypass from another code path.

- FR-006b: once any instalment has `creditStatementId !== null`, `applyUpdate` refuses to
  change `totalPrincipal`, `installmentCount`, `startDate` or `cardId`. Descriptive fields
  stay open. New error `INSTALLMENT_PLAN_BILLED`.
- FR-006a: `RemoveInstallmentPlanHandler` refuses when any instalment is stamped onto a
  **settled** period (`paidAt !== null`). New error `INSTALLMENT_PLAN_SETTLED`. Deleting is
  still allowed while every stamped period is merely PENDING, because unwinding a PENDING
  period touches no real payment.

**Rationale**: an emitted bill is a statement about the world that was already shown to the
user; letting the plan behind it change would make a stored period describe something that
no longer exists.

---

## R10 — Test strategy

**Decision**, following Constitution IV and the tiers established by specs/009:

- **Unit** (`apps/api/test/unit/`, zero DB): the stamping selection function, the extended
  `totalFor`, the new aggregate refusals, and the settle-instalments-on-payment rule — all
  against fake ports from `test/unit/support/fake-ports.ts`.
- **Integration** (real DB): the close→stamp transaction (including its rollback), the
  gap case of R2 (a period skipped for lack of usage), and the exclusion of
  `installmentPlanId` movements from `sumLinkedTransactions`.
- **E2E**: the whole life of a 12-instalment plan — create (pool drops by the total),
  close a period (bills one instalment), pay it (instalment settles), repeat past the last
  instalment (nothing more is billed).
- **Contracts** (`packages/contracts`): the new derived instalment status and the plan's
  three counters.
- **Web**: the plan row's three counters, the absent pay action on a credit-card plan, and
  its continued presence on every other plan.

SC-003 (nothing billed twice, nothing missed, across the whole life of a plan) is the
invariant the E2E tier exists to prove, and is the single most important test in this
feature.

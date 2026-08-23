# Checklist: Financial Integrity & Regression Safety

**Purpose**: Validate that the REQUIREMENTS for 014 are complete, unambiguous and
internally consistent on the three axes where this feature can corrupt money — an
instalment billed twice or never, a credit pool moved twice, and a regression on plans
that are not credit-card plans.
**Created**: 2026-08-22
**Feature**: [spec.md](../spec.md)
**Depth**: Release gate — this is money arithmetic; an ambiguous requirement here becomes a
wrong balance nobody detects.
**Audience**: Author before implementing; reviewer at PR.

> These are unit tests for the requirements text, not for the code. Each item asks whether
> something is **specified well enough to implement without guessing**.

## Exactly-once billing (no instalment charged twice, none missed)

- [x] CHK001 - Is the selection rule for which instalments a closing period charges stated as a complete predicate (due-date bound AND not-yet-billed AND account scope AND currency match), rather than as prose that a reader must assemble? [Clarity, Spec §FR-008, §FR-009, §FR-009a]
- [x] CHK002 - Is the exactly-once guarantee stated as a property of the whole life of a plan, not merely of a single period close? [Measurability, Spec §SC-003]
- [x] CHK003 - Are requirements defined for the case where no billing period exists for a stretch of time, given that periods are created lazily? [Coverage, Spec §Edge Cases, §FR-009]
- [x] CHK004 - Is it specified whether re-running generation over an already-closed period is idempotent, or whether re-running is prevented altogether? [Gap, Spec §FR-009]
- [x] CHK005 - Do the requirements state what happens to instalments that fell due while the account was ineligible to bill, once eligibility returns? [Coverage, Spec §Edge Cases]
- [x] CHK006 - Is the boundary of "vencida hasta el cierre" defined precisely enough to settle whether an instalment due exactly at the closing instant is included? [Ambiguity, Spec §FR-008]
- [x] CHK007 - Are requirements defined for two or more plans on the same card whose instalments fall in the same period? [Coverage, Spec §Edge Cases]
- [x] CHK008 - Is the terminal condition ("after the last instalment, nothing more is charged") specified as an emergent consequence of the selection rule rather than as a separate counter that could drift from it? [Consistency, Spec §FR-013]
- [x] CHK009 - Do the requirements state what an instalment's billed status means for a plan whose card was deleted after the plan was created? [Gap, Assumption]

## Credit pool moved exactly once

- [x] CHK010 - Is it explicit that the purchase movement consumes the pool and the period's charge does NOT, so the same debt never increments the pool twice? [Clarity, Spec §FR-002, §FR-007]
- [x] CHK011 - Is the amount by which the pool decreases on payment specified as "what was actually paid", distinctly from "what the period totalled"? [Clarity, Spec §FR-016]
- [x] CHK012 - Are the interest charge and the purchase movement specified as two separate, non-overlapping contributions to the pool, with no possibility of the interest being counted inside the principal? [Consistency, Spec §FR-004]
- [x] CHK013 - Is the pool effect of deleting a plan specified to be the exact inverse of the pool effect of creating it? [Completeness, Spec §FR-006]
- [x] CHK014 - Do the requirements state that the declaration shown before deletion and the reversal actually applied come from one source, per the constitution's irreversible-impact rule? [Traceability, Spec §FR-006, Constitution §I]
- [x] CHK015 - Is the pool effect of correcting a settled period's payment specified, given the correction changes what was paid? [Coverage, Spec §FR-017]
- [x] CHK016 - Are requirements defined for whether the purchase movement affects the account's cash balance, or only its pool? [Gap]
- [x] CHK017 - Is the exclusion of the purchase movement from period totals stated as a requirement in its own right, rather than left implicit in the "one instalment per period" outcome? [Completeness, Spec §FR-007]

## Shortfall counted in exactly one place

- [x] CHK018 - Is it unambiguous that a partial payment settles the period's instalments AND carries the shortfall forward, and that these are not alternatives? [Ambiguity, Spec §FR-014, §FR-015]
- [x] CHK019 - Is the rationale (a shortfall counted on both the item and its carry is the same debt twice) recorded in the requirements, so a future reader cannot "fix" it back? [Traceability, Spec §FR-015, Constitution §I]
- [x] CHK020 - Do the requirements state what an individual instalment's own carry-over figure holds for a credit-card plan, given the shortfall lives at the period level? [Gap, Spec §FR-025]
- [x] CHK021 - Is the two-level carry-over reconciled against the constitution's "one mechanism, not one per domain" rule, rather than left looking like a contradiction? [Consistency, Spec §FR-025, Constitution §I]
- [x] CHK022 - Is it specified how a settled-but-short period must be tested for (settled vs. a specific status name), given the project already recorded this as a trap? [Clarity, Spec §FR-014]
- [x] CHK023 - Are the requirements clear that the carry-over figure is undifferentiated, and is the consequence (no per-line-item attribution of the shortfall) stated rather than assumed? [Completeness, Spec §Clarifications]

## No regression on non-credit-card plans

- [x] CHK024 - Is the no-change guarantee for non-credit-card plans stated as a positive, testable requirement rather than only as an out-of-scope note? [Measurability, Spec §FR-005, §FR-022]
- [x] CHK025 - Is there a machine-checkable invariant that distinguishes the two classes of plan, so a regression surfaces as a failing assertion rather than as an unnoticed behavior change? [Measurability, Spec §FR-005]
- [x] CHK026 - Are the requirements consistent about which single attribute decides a plan's class, with no second, divergent way to ask the same question? [Consistency, Spec §FR-005, §FR-021]
- [x] CHK027 - Do the requirements state what the per-instalment pay action must do if invoked on a credit-card plan through means other than the UI? [Coverage, Gap]
- [x] CHK028 - Is the pre-existing instalment-payment movement distinguished in requirements from the new purchase movement, given both belong to a plan? [Clarity, Spec §FR-024]

## Acceptance criteria quality

- [x] CHK029 - Can each success criterion be evaluated without knowing the implementation, and does each name the observable it measures? [Measurability, Spec §SC-001..SC-007]
- [x] CHK030 - Is SC-003 (the whole-life exactly-once invariant) expressed so that a single test can falsify it? [Measurability, Spec §SC-003]
- [x] CHK031 - Is SC-007 ("no action that moves no money") stated so that its scope is bounded and checkable, rather than an open-ended sweep of the UI? [Clarity, Spec §SC-007]
- [x] CHK032 - Are the two new refusal conditions specified with the state that triggers them, distinguishable from each other? [Clarity, Spec §FR-006a, §FR-006b]
- [x] CHK033 - Is the narrower scope of the deletion refusal versus the edit freeze deliberate and stated, rather than an accident of two separately-written rules? [Consistency, Spec §FR-006a, §FR-006b]

## Ambiguities, assumptions & dependencies

- [x] CHK034 - Is the assumption about issuer behavior (full commitment on purchase day) recorded as an assumption, so a market where it is false is a known limitation rather than a bug? [Assumption, Spec §Assumptions]
- [x] CHK035 - Is the absence of currency conversion stated as the reason a mismatched-currency instalment is not billed, rather than the behavior being left unexplained? [Traceability, Spec §FR-009a]
- [x] CHK036 - Are the requirements explicit that no data migration occurs and that pre-existing plans keep the old shape, so their absence of billed instalments is not read as a defect? [Assumption, Spec §Assumptions]
- [x] CHK037 - Is it specified what a user sees when a condition prevents billing indefinitely, rather than instalments silently never being charged? [Coverage, Spec §FR-009a, §FR-023a]
- [x] CHK038 - Are requirements defined for reconciliation preserving billed instalments, given reconciliation recomputes a period from real movements and instalments are not movements? [Coverage, Spec §FR-012]

## Run result (2026-08-22)

38/38 pass — **but 6 items failed on the first pass** and were fixed by amending the spec,
which is the whole point of running this before `tasks`:

| Item   | Was missing                                                                    | Added               |
| ------ | ------------------------------------------------------------------------------ | ------------------- |
| CHK004 | idempotency of re-running generation was implied by the design, never required | FR-013a             |
| CHK006 | "vencida hasta el cierre" left the exact-instant case undefined                | FR-013b             |
| CHK009 | a plan whose card is deleted has no account to bill; unspecified               | Edge Case + FR-023a |
| CHK016 | whether the purchase movement touches cash balance was never stated            | FR-002a             |
| CHK022 | "settled" must be tested by the fact of payment, not a status name             | FR-014a             |
| CHK027 | the per-instalment pay action was hidden in the UI but not refused server-side | FR-022a             |

CHK027 was the most consequential: hiding a button prevents an accident, refusing the
operation prevents the double-count. The spec had only the first.

## Notes

- Items are requirement-quality questions. An unchecked item means the **spec** needs a
  sentence, not that the code needs a fix.
- CHK002, CHK010, CHK018 and CHK024 are the four that map one-to-one onto the failure modes
  named in the request. If only four are reviewed, review those.
- CHK003 is the item that justifies the whole design: if the spec does not pin down the
  lazy-period gap, an implementer will reasonably derive billing from dates and ship the
  double-charge.

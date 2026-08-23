# Specification Quality Checklist: Facturación de compras en cuotas con tarjeta de crédito

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation notes (iteration 1)

Issues found and corrected before marking the checklist complete:

1. **Implementation leakage** — the first draft named the new column, the repository
   method and the handler files. All removed: the spec now says "un vínculo con la
   facturación que la cobró" and leaves the storage shape to `plan.md`. The one
   remaining proper noun is the product vocabulary the user already sees in the app
   (Cuotas, Facturación, Movimientos), which is intentional.
2. **Untestable success criteria** — "el cupo es correcto" was replaced by SC-001
   ("reduce el cupo disponible por el 100% del monto comprometido, en el momento del
   registro") and SC-003, which states the whole-life invariant (ninguna cuota se
   cobra dos veces ni deja de cobrarse) that the lazy-period edge case threatens.
3. **Unbounded scope** — added FR-005 and FR-022 as explicit no-change requirements
   for non-credit-card plans, so "out of scope" is enforced by a test rather than by
   a sentence in prose.

## Resolved by `/speckit-clarify` (session 2026-08-22)

All three items carried out of iteration 1 were answered, plus two the ambiguity
scan surfaced. See the spec's `## Clarifications` section:

- **Alcance del período** → FR-008: a period bills only the instalments of plans
  whose card belongs to that same account. The scan caught this: the first draft of
  FR-008 said "todas las cuotas del usuario", which would have billed one issuer for
  another issuer's purchases.
- **Editar un plan con cuotas ya cobradas** → FR-006b: commitment-defining fields
  freeze from the first billed instalment; descriptive fields stay editable.
- **Eliminar un plan con cuotas ya saldadas** → FR-006a: refused, because reversing
  it would require undoing a real payment.
- **Moneda distinta entre cuota y cuenta** → FR-009a: not billed, and the plan warns.
  The app has no FX, so billing it would mean inventing a rate.
- **Cuenta sin día de facturación** → FR-023a: the plan warns and links to the
  configuration, instead of showing instalments that will never be charged.

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
- All items pass as of iteration 1.

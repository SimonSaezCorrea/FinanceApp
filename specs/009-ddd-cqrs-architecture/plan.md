# Implementation Plan: Backend DDD + CQRS Architecture Migration

**Branch**: `009-ddd-cqrs-architecture` | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-ddd-cqrs-architecture/spec.md`

## Summary

Migrate `apps/api` from a flat domain-first layout (one `*.service.ts` mixing rules,
orchestration, and persistence) to full tactical DDD + CQRS, per domain: **domain** (aggregates
that own their invariants and lifecycle), **application** (`@nestjs/cqrs` command/query handlers
built on a shared Template Method skeleton), **infrastructure** (Prisma repository adapters behind
domain-owned ports), **presentation** (thin controllers acting as a Facade, with Zod validating
body/query/**and now path params**). Domain events (via `@nestjs/cqrs`'s `EventBus`, dispatched
synchronously by default) decouple reactions from the module that causes them. Applied uniformly
to all 11 domains, one at a time, `accounts`/`billing` first as the reference implementation
(its statement lifecycle is a textbook fit for the **State** pattern). Tests move out of `src/`
into `apps/api/test/{unit,integration,e2e}`, mirroring `src/`. No public API contract changes.

## Technical Context

**Language/Version**: TypeScript 6.x, Node 20 (unchanged)

**Primary Dependencies**: NestJS 11 (unchanged), **`@nestjs/cqrs` (NEW)** for
`CommandBus`/`QueryBus`/`EventBus`, Prisma 7 / `@prisma/adapter-pg` (unchanged, now only reachable
through repository adapters), Zod (unchanged, extended to path params via a small
`ZodParamsPipe` alongside the existing `ZodValidationPipe`)

**Storage**: PostgreSQL via Prisma (unchanged — no schema changes; this is a code-organization
migration, not a data-model migration)

**Testing**: Vitest (unchanged), reorganized into `apps/api/test/{unit,integration,e2e}` mirroring
`src/domains/<domain>/{domain,application,infrastructure,presentation}/`

**Target Platform**: Same Node server deployment as today (unchanged)

**Project Type**: Web service (NestJS API within the existing `apps/api` pnpm workspace)

**Performance Goals**: No new performance target introduced by this migration — parity with
current behavior is the bar (see spec SC-001). Not scoped for this personal-use project;
revisit if/when real load characteristics emerge.

**Constraints**: No breaking changes to any existing endpoint or `@finance/contracts` shape (spec
FR-015); no new distributed infrastructure — events stay in-process (spec FR-019); domain and
application layers MUST NOT import Prisma types directly (only infrastructure may).

**Scale/Scope**: 11 domains (auth, accounts, transactions, installments, debts, recurring,
savings, investments, import, wallet, reference), migrated one at a time; single-tenant-per-row
multi-user personal finance data (unchanged volume characteristics).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                    | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Result                                                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| I. Money Precision (NON-NEGOTIABLE)          | Aggregates (e.g. `CreditStatement`) MUST keep using `decimal.js` internally and only cross the repository-adapter boundary as `Prisma.Decimal`/decimal strings — no `number` math introduced by the refactor.                                                                                                                                                                                                                                                                                                                                                                                                                                         | PASS (carried over unchanged from current code; enforced by code review per domain migration)                                       |
| II. Per-User Data Isolation (NON-NEGOTIABLE) | `userId` scoping moves from ad-hoc repository method params to being a mandatory, TYPED field on every user-scoped Command/Query (`scope: "user"`), enforced once by the shared Template Method base handler (fetch-scoped-by-user before any domain logic runs) instead of being re-checked per method. **Named exception**: a small number of genuinely system-wide triggers (the billing cron's `GenerateAllDueStatementsCommand`) are typed `scope: "system"` and skip user-scoping at the command level — each aggregate they touch is still scoped to its own owning user internally via the repository, so no cross-user data exposure occurs. | PASS — strengthens this principle by centralizing the check and making the system-wide exception explicit/typed instead of implicit |
| III. i18n Parity                             | N/A — backend-only, no user-facing strings change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | PASS (not applicable)                                                                                                               |
| IV. Test-First / TDD                         | Each domain's migration MUST write the aggregate/handler unit tests (in the new `test/unit/` tree) before/alongside moving its logic, not after                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | PASS — reinforced by FR-016/SC-002; migration order per domain follows red-green-refactor at the unit level                         |
| V. SDD & Living Memory                       | This entire feature is being executed through the Spec Kit lifecycle (this plan); CLAUDE.md + constitution + `docs/ARCHITECTURE.md` updates are tracked as explicit tasks, not an afterthought                                                                                                                                                                                                                                                                                                                                                                                                                                                        | PASS                                                                                                                                |

No violations. No Complexity Tracking entries needed — the added layering is the deliberate,
approved subject of this feature, not an unplanned deviation from a simpler baseline.

## Project Structure

### Documentation (this feature)

```text
specs/009-ddd-cqrs-architecture/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (pattern contracts — see below)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

This is a **backend-internal refactor** of the existing `apps/api` workspace — no new
apps/packages. Reference layout for one domain (`accounts`, migrated first); every other domain
follows the identical shape:

```text
apps/api/
├── src/
│   ├── domains/
│   │   └── accounts/
│   │       ├── accounts.module.ts                  # wires all 4 layers + CqrsModule
│   │       ├── domain/
│   │       │   ├── bank-account.aggregate.ts       # invariants: cardable types, credit pool rules
│   │       │   ├── credit-statement.aggregate.ts   # State pattern: Open/Pending/Paid state objects
│   │       │   ├── states/
│   │       │   │   ├── credit-statement-state.ts       # interface: canPay(), canClose(), canCorrect()
│   │       │   │   ├── open-state.ts
│   │       │   │   ├── pending-state.ts
│   │       │   │   └── paid-state.ts
│   │       │   ├── billing-eligibility.strategy.ts # Strategy: CREDIT_LINE vs add-on-card eligibility
│   │       │   ├── events/
│   │       │   │   ├── statement-closed.event.ts
│   │       │   │   ├── statement-paid.event.ts
│   │       │   │   └── account-deactivated.event.ts
│   │       │   └── ports/
│   │       │       ├── bank-account.repository.port.ts
│   │       │       └── credit-statement.repository.port.ts
│   │       ├── application/
│   │       │   ├── base-command.handler.ts         # Template Method skeleton
│   │       │   ├── commands/
│   │       │   │   ├── pay-credit-statement.command.ts
│   │       │   │   ├── pay-credit-statement.handler.ts
│   │       │   │   ├── generate-statements.command.ts
│   │       │   │   └── generate-statements.handler.ts
│   │       │   ├── queries/
│   │       │   │   ├── list-credit-statements.query.ts
│   │       │   │   └── list-credit-statements.handler.ts
│   │       │   └── events/
│   │       │       └── log-statement-paid.listener.ts   # first Observer subscriber (reference only)
│   │       ├── infrastructure/
│   │       │   ├── prisma-bank-account.repository.ts     # Adapter implementing the port
│   │       │   └── prisma-credit-statement.repository.ts
│   │       └── presentation/
│   │           ├── accounts.controller.ts           # Facade: request → command/query → response
│   │           └── dto/
│   │               ├── pay-credit-statement.params.ts   # Zod path-param schema (FR-010)
│   │               └── pay-credit-statement.body.ts
│   └── infra/                                       # unchanged cross-cutting: prisma, auth, http, cron
└── test/
    ├── unit/domains/accounts/domain/
    │   ├── credit-statement.aggregate.spec.ts        # zero DB, zero HTTP
    │   └── billing-eligibility.strategy.spec.ts
    ├── integration/domains/accounts/infrastructure/
    │   └── prisma-credit-statement.repository.spec.ts # real test DB
    └── e2e/domains/accounts/
        └── accounts.http.spec.ts                      # through the HTTP layer
```

**Structure Decision**: Domain-first monorepo layout is preserved at the top level
(`src/domains/<domain>/`); each domain gains the four sub-layers internally. Tests move to a
parallel `apps/api/test/` tree mirroring `src/domains/<domain>/<layer>/`, split by kind
(`unit`/`integration`/`e2e`) per FR-016. `accounts` (specifically its `billing` sub-area) is the
reference implementation for Phase 1 design artifacts below; the same shape is replicated to the
remaining 10 domains as tracked tasks in `/speckit-tasks`.

## Complexity Tracking

_No entries — see Constitution Check above._

## Post-Design Constitution Re-Check

_Performed after Phase 1 (`data-model.md`, `contracts/`, `quickstart.md`)._

No new violations introduced by the design artifacts. `data-model.md` confirms money fields stay
`decimal.js`/`Prisma.Decimal`-shaped end to end (aggregate → adapter); `contracts/layer-contracts.md`
confirms `userId` is a mandatory field on every Command/Query, enforced once in
`BaseCommandHandler.loadContext`. **Gate: PASS.**

# Implementation Plan: Unified Row Identifiers

**Branch**: `016-unified-row-ids` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-unified-row-ids/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Unify every table's row identifier on one format (UUID v7) — replacing both the schema's
`@default(cuid())` and the five write paths that mint their own id with `randomUUID()` (v4) — and
validate that format at the API boundary (path params + body fields referencing another row) via
one shared zod schema, rejecting a malformed or wrong-version id with a single `INVALID_ID_FORMAT`
error code before any database query runs. Closes docs/PENDING.md points 1 and 2 (constitution
Principle VIII). No new endpoint, no new table, no production-data migration (none exists).

## Technical Context

**Language/Version**: TypeScript (NestJS 11 / Express 5 backend on Node 20; Vite + React 19
frontend — this feature only touches the backend and the shared contracts package, `apps/web` gets
no new UI, only the new `errors.INVALID_ID_FORMAT` i18n string for the existing generic error-code
mapping).

**Primary Dependencies**: Prisma 7 (`@default(uuid(7))` schema default), zod 4 (`z.uuidv7()`), the
`uuid` npm package (new dependency, `apps/api` only — provides `v7()` for the five application-
minted-id sites).

**Storage**: PostgreSQL 16 (via `@prisma/adapter-pg`) — schema-default change only, no new table,
no raw SQL migration (`db push`, per this repo's existing no-migrations-folder convention).

**Testing**: Vitest (`apps/api/test/{unit,integration,e2e}`, `packages/contracts`'s own suite).

**Target Platform**: Existing deployment target, unchanged (Linux server via the same NestJS app).

**Project Type**: Web application (monorepo: `apps/api` + `apps/web` + `packages/contracts`) —
this feature is backend + contracts only.

**Performance Goals**: N/A — no new hot path; UUID v7 generation is O(1) and Prisma's own default
mechanism already used a comparable cost (`cuid()`) on every insert.

**Constraints**: No production data to migrate (spec Assumption). Must not change the existing
`{error:{code,field}}` response envelope. Must not remove the existing literal-route-before-`:id`
declaration ordering convention (research.md Decision 5).

**Scale/Scope**: 24 tables (schema defaults), 5 application-minted-id call sites, 13 path-param
schema files, ~62 domain-schema id-shaped fields across `packages/contracts/src/**`, 2 shared
pipes (`ZodValidationPipe`, `ZodParamsPipe`).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Data gates (always applicable — see Principles II, VII and VIII):**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de Identificadores.
      — No new entity is introduced. Every EXISTING entity's id format is being brought into
      conformance by this feature itself (UUID v7 everywhere, schema default + the 5 minting
      sites unified — research.md Decisions 1-2, data-model.md). This is the gate's own subject,
      not a bypass of it.
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface.
      — No new write endpoint. The ten endpoints already protected by specs/015's idempotency
      mechanism (form c) are unaffected: their `Idempotency-Key` handling is orthogonal to id
      _format_, and none of their `IdempotencyRecord` keys are derived from a row id in a way this
      feature changes.
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership.
      — Out of scope by design (spec Assumptions / Edge Cases): this feature validates _format_
      only, not ownership. The five FK-ownership gaps tracked in docs/PENDING.md point 3 remain
      open and are explicitly deferred to their own future spec — format validation is a
      prerequisite layer, not a substitute (research.md Decision 3, "Alternatives considered").

No violations requiring justification — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/016-unified-row-ids/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── id-validation.md # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   └── schema.prisma                          # 24 `@default(cuid())` → `@default(uuid(7))`
├── src/
│   ├── infra/
│   │   ├── id/
│   │   │   └── generate-row-id.ts              # NEW — shared uuid-v7 minting helper
│   │   └── http/
│   │       ├── zod-validation.pipe.ts          # gains INVALID_ID_FORMAT meta-tag mapping
│   │       └── zod-params.pipe.ts               # gains INVALID_ID_FORMAT meta-tag mapping
│   └── domains/
│       ├── credit-statement/application/commands/pay-credit-statement.handler.ts   # randomUUID() → generate-row-id
│       ├── installment-plan/application/commands/pay-installment.handler.ts        # randomUUID() → generate-row-id
│       ├── installment-plan/application/commands/create-installment-plan.handler.ts # randomUUID() → generate-row-id
│       ├── transaction/application/commands/create-transfer.handler.ts             # randomUUID() → generate-row-id
│       ├── transaction-attachment/application/commands/upload-attachment.handler.ts # randomUUID() → generate-row-id
│       └── */presentation/dto/*.params.ts      # 13 files — id fields switch to `rowId`
└── test/{unit,integration,e2e}/                # new/updated coverage per tasks.md

packages/contracts/
└── src/
    ├── common/
    │   └── row-id.ts                           # NEW — shared `rowId` zod schema
    └── **/*.ts                                  # ~62 id-shaped fields switch to `rowId`

apps/web/
└── src/i18n/{es,en}.json                       # + errors.INVALID_ID_FORMAT

specs/009-ddd-cqrs-architecture/
└── quickstart.md                               # SC-007 section rewritten (research.md Decision 6)

docs/
├── PENDING.md                                  # points 1 and 2 marked closed by this feature
.specify/memory/constitution.md                 # new Sync Impact Report amendment recording closure
CLAUDE.md                                        # id-format convention documented
```

**Structure Decision**: Backend + shared-contracts change inside the existing monorepo layout — no
new app, no new package. `apps/api → packages/contracts` (existing one-way dependency) is exactly
where the shared `rowId` schema and the id-minting helper split: the helper is backend-only
(`apps/api/src/infra/id/`) because only the API ever mints a row id; the validation schema is
shared (`packages/contracts/src/common/`) because both the API (via the pipes) and, transitively,
`apps/web`'s generated types need to agree on the shape.

## Complexity Tracking

_No entries — Constitution Check passed without violations._

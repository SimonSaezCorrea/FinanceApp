# Implementation Plan: Opaque Cursor & Storage Key

**Branch**: `017-opaque-identifiers` | **Date**: 2026-09-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-opaque-identifiers/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Sign the transaction-list pagination cursor with an HMAC + version tag so a tampered, forged, or
wrong-version cursor is rejected as `INVALID_CURSOR` before any query runs on values decoded from
it, and replace the attachment storage key's user/transaction/attachment-derived shape with a
fully flat, independently random value that reveals nothing about the resource it stores. Closes
docs/PENDING.md points 5 and 6 (constitution: keyset-cursor opacity norm + object-storage-key norm).
No new endpoint, no new table, no schema/column change, no migration (no production data).

## Technical Context

**Language/Version**: TypeScript (NestJS 11 backend, Node 20) — this feature touches only
`apps/api`; no frontend or contracts-package change (both `nextCursor` and `storageKey` were
already opaque strings from the client's point of view, and remain so).

**Primary Dependencies**: Node's built-in `node:crypto` (`createHmac`, `timingSafeEqual`,
`randomUUID`) — no new npm dependency.

**Storage**: PostgreSQL (via `@prisma/adapter-pg`) — no schema change; S3-compatible object storage
for attachments — no adapter interface change, only the key value a caller passes to it.

**Testing**: Vitest (`apps/api/test/{unit,integration,e2e}`).

**Target Platform**: Existing deployment target, unchanged.

**Project Type**: Web application (monorepo) — backend-only for this feature.

**Performance Goals**: N/A — one HMAC computation per paginated request (negligible; the same cost
class as the JWT verification every authenticated request already pays) and one `randomUUID()` call
per attachment upload (already calling `generateRowId()` once per upload today for the row's own
id — this adds a second, equally cheap, random-value generation).

**Constraints**: Must reuse the existing `INVALID_CURSOR` domain error (research.md Decision 1) —
no new error code. Must not change `TransactionAttachment`'s schema (research.md Decision 4 — no
migration). Single static signing secret only, no rotation support (spec Clarifications).

**Scale/Scope**: 2 files change behavior (`transaction-cursor.ts`, `attachment-policy.ts`'s
`storageKeyFor`), 1 file gains a new config helper (`infra/config/cursor.config.ts`), 1 query
handler gains a `ConfigService` injection (`list-transactions.handler.ts`), 1 new env var.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Data gates (always applicable — see Principles II, VII and VIII):**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de Identificadores.
      — No new entity/table. The two values this feature changes (the cursor token, the storage
      key) are explicitly NOT row identifiers (data-model.md) — Principle VIII governs the `id`
      column format (UUID v7, closed by specs/016) and is unaffected here.
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface.
      — No new write endpoint. `POST /transactions/:id/attachments` is unaffected by specs/015's
      idempotency scope (attachment upload was explicitly left unprotected there — no change to
      that status here) and this feature doesn't touch its request/response contract.
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership.
      — No new body-supplied FK. Both changes are to server-generated values (the signed cursor,
      the random storage key), never to a caller-supplied reference.

No violations requiring justification — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/017-opaque-identifiers/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── behavior-change.md  # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/api/
├── .env.example                                                        # + CURSOR_SIGNING_SECRET
├── src/
│   ├── infra/
│   │   └── config/
│   │       └── cursor.config.ts                                        # NEW — getCursorSigningSecret(config)
│   └── domains/
│       ├── transaction/
│       │   ├── domain/errors.ts                                        # InvalidCursorError — reused, unchanged
│       │   └── application/queries/
│       │       ├── transaction-cursor.ts                                # encodeCursor/decodeCursor gain a `secret` param + HMAC
│       │       └── list-transactions.handler.ts                        # injects ConfigService, resolves secret once
│       └── transaction-attachment/
│           └── domain/attachment-policy.ts                              # storageKeyFor → randomUUID(), drops all inputs
└── test/{unit,integration,e2e}/                                        # new/updated coverage per tasks.md
```

**Structure Decision**: Backend-only change inside the existing monorepo layout — no new package,
no new domain. The new config helper follows the exact precedent of `infra/config/storage.config.ts`
(`readS3Config`); the cursor codec stays in its existing home (`transaction/application/queries/`)
as plain functions, now parameterized by an explicit secret rather than reading one implicitly —
keeping `apps/api → packages/contracts` and the domain/infrastructure boundary exactly as they are
today (research.md Decision 2).

## Complexity Tracking

_No entries — Constitution Check passed without violations._

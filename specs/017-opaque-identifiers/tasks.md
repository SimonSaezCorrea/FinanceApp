---
description: "Task list for Opaque Cursor & Storage Key"
---

# Tasks: Opaque Cursor & Storage Key

**Input**: Design documents from `/specs/017-opaque-identifiers/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/behavior-change.md, quickstart.md

**Tests**: Included — both stories are security-relevant conformance debt with concrete
attack/regression scenarios spelled out in the spec (SC-001 through SC-004).

**Organization**: Tasks are grouped by user story (US1 = signed cursor, US2 = opaque storage key)
to enable independent implementation and testing of each — they touch entirely disjoint files.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)

## Path Conventions

Monorepo per plan.md: `apps/api/src/`, `apps/api/test/{unit,integration,e2e}/`, `apps/api/.env.example`.

---

## Phase 1: Setup

**Purpose**: Declare the one new environment variable this feature needs.

- [x] T001 Add `CURSOR_SIGNING_SECRET` to `apps/api/.env.example` (placeholder value, same "change-me-…" convention as `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`) and to any local `.env` used for running tests

---

## Phase 2: Foundational

**Purpose**: None — US1 and US2 are structurally independent (different files, different
domains) and need no shared primitive. Both can start immediately after Setup.

**Checkpoint**: N/A — proceed directly to US1/US2, in parallel or either order.

---

## Phase 3: User Story 1 - A forged or corrupted pagination cursor is rejected (Priority: P1) 🎯 MVP

**Goal**: `encodeCursor`/`decodeCursor` produce and verify an HMAC-signed, versioned cursor; any
tampered, forged, or wrong-version cursor is rejected as `INVALID_CURSOR` before it reaches a
query; an unmodified freshly-issued cursor keeps working exactly as before.

**Independent Test**: Tamper one byte of a real cursor and confirm `INVALID_CURSOR`; round-trip an
untouched cursor and confirm the correct next page — per quickstart.md §1-§3.

### Tests for User Story 1

- [x] T002 [P] [US1] Create `apps/api/test/unit/domains/transaction/application/queries/transaction-cursor.spec.ts`: `encodeCursor`/`decodeCursor` round-trip correctly with a given secret; a decoded cursor with any byte of the payload or MAC segment flipped throws `InvalidCursorError`; a cursor with a version other than the current one throws `InvalidCursorError` even with a valid MAC for that (wrong) version's payload; a cursor missing the `.` separator, or with more than one, throws `InvalidCursorError`; two different secrets never validate each other's cursors
- [x] T003 [P] [US1] Update `apps/api/test/unit/domains/transaction/application/queries/list-transactions.handler.spec.ts` for the new `ConfigService` constructor param (fake returning a fixed test secret)
- [x] T004 [P] [US1] E2E: in `apps/api/test/e2e/domains/transaction/transactions.http.spec.ts`, add cases per quickstart.md §1-§3 — a real issued cursor round-trips; a byte-tampered cursor returns `400 INVALID_CURSOR`; the OLD pre-feature unsigned encoding (`base64url("<date>|<id>")`, no `.` separator) also returns `400 INVALID_CURSOR`

### Implementation for User Story 1

- [x] T005 [US1] Create `apps/api/src/infra/config/cursor.config.ts` exporting `getCursorSigningSecret(config: ConfigService): string` (`config.getOrThrow("CURSOR_SIGNING_SECRET")`), mirroring `readS3Config`'s shape (research.md Decision 2)
- [x] T006 [US1] Rewrite `apps/api/src/domains/transaction/application/queries/transaction-cursor.ts`: `encodeCursor(cursor, secret)` builds `"<version>|<occurredAt>|<id>"`, HMAC-SHA256s it with `secret`, returns `base64url(payload) + "." + base64url(mac)`; `decodeCursor(raw, secret)` splits on `.` (exactly 2 parts or throw), recomputes the MAC and compares with `crypto.timingSafeEqual`, checks the decoded version equals the current one, then parses `occurredAt`/`id` as today — any failure throws `InvalidCursorError` (research.md Decision 1)
- [x] T007 [US1] Update `apps/api/src/domains/transaction/application/queries/list-transactions.handler.ts`: inject `ConfigService`, resolve the secret once via `getCursorSigningSecret`, pass it to both `encodeCursor`/`decodeCursor` calls

**Checkpoint**: A malformed/forged/wrong-version cursor is rejected before any query runs; a valid one still pages correctly.

---

## Phase 4: User Story 2 - An attachment's storage location reveals nothing about its owner (Priority: P2)

**Goal**: `storageKeyFor` returns a flat, independently random value with no relationship to
`userId`/`transactionId`/`attachmentId`/filename; uniqueness and every existing upload/list/view
flow are unaffected.

**Independent Test**: Upload an attachment and confirm its recorded storage key contains neither
the user's id nor the transaction's id as a substring — per quickstart.md §4-§5.

### Tests for User Story 2

- [x] T008 [P] [US2] Update `apps/api/test/unit/domains/transaction-attachment/attachment-policy.spec.ts`: `storageKeyFor` takes NO parameters and returns a UUID v4 string (matches `/^[0-9a-f]{8}-...-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-...$/i`); two calls never collide (generate N values, assert all unique)
- [x] T009 [P] [US2] E2E: in `apps/api/test/e2e/domains/transaction-attachment/attachments.http.spec.ts`, after uploading, assert the persisted `storageKey` (read via Prisma in the test, same pattern the file already uses for `objects` bookkeeping) contains neither the test user's id nor the transaction's id as a substring, and that upload/list/view still return `201`/`200` unchanged (SC-004)

### Implementation for User Story 2

- [x] T010 [US2] Rewrite `storageKeyFor` in `apps/api/src/domains/transaction-attachment/domain/attachment-policy.ts`: drop the `userId`/`transactionId`/`attachmentId`/`fileName` parameters entirely (an unused parameter is worse than none) and return `randomUUID()` from `node:crypto` (research.md Decision 3) — no slug, no path segments
- [x] T011 [US2] Update the call site in `apps/api/src/domains/transaction-attachment/application/commands/upload-attachment.handler.ts` to match `storageKeyFor`'s new parameterless signature

**Checkpoint**: Every newly uploaded attachment's storage key is flat and unrelated to any resource id; upload/list/view are unaffected.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Close the loop on the conformance-debt tracking this feature exists to resolve, and confirm no regressions.

- [x] T012 [P] Update `docs/PENDING.md` — mark points 5 and 6 under "Deuda de conformidad con la constitución v2.0.0" as closed by specs/017, following the style of points 1-4's closure notes (specs/015/016)
- [x] T013 [P] Add a new Sync Impact Report entry at the top of `.specify/memory/constitution.md` recording this closure (MINOR version bump — no principle redefined, two documented conformance gaps closed)
- [x] T013a [P] Add a durable note under CLAUDE.md's `## Conventions` section (or extend the existing "Identifiers:" bullet from specs/016) documenting `CURSOR_SIGNING_SECRET` and the new opaque `storageKey` format — the discoverable reference future contributors would grep for (FR-007, closes the G1 gap found by `/speckit-analyze`)
- [ ] T014 Run `pnpm --filter @finance/api test && pnpm --filter @finance/api test:integration && pnpm --filter @finance/api test:e2e && pnpm typecheck && pnpm lint && pnpm format:check` and confirm zero regressions (SC-004) — **partially done**: `test:unit` (561/561), `typecheck`, `lint`, `format:check` and `check:boundaries` ran clean in the implementing session; `test:integration`/`test:e2e` need a reachable Postgres, which that sandbox didn't have configured/authorized to provision destructively — pending a run with a real test DB
- [ ] T015 Walk through quickstart.md end-to-end (§1-§6) manually once, to catch anything the automated tests don't — pending, needs a running API + DB

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: N/A — nothing shared between US1/US2.
- **US1 (Phase 3)** and **US2 (Phase 4)**: Both depend only on Setup — genuinely independent
  (different domains, different files) and can proceed fully in parallel.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Parallel Opportunities

- T002-T004 (US1 tests) and T008-T009 (US2 tests) can all run in parallel with each other.
- T005/T006 (US1) and T010 (US2) touch entirely disjoint files and can be built in parallel by two
  developers; T007 depends on T005+T006, T011 depends on T010.
- T012/T013 (Polish docs) can run in parallel with each other.

---

## Parallel Example: US1 + US2 kickoff

```bash
# Immediately after Setup, in parallel:
Task: "Create transaction-cursor.spec.ts (US1 tests)"
Task: "Update attachment-policy.spec.ts (US2 tests)"
Task: "Create infra/config/cursor.config.ts (US1)"
Task: "Rewrite storageKeyFor in attachment-policy.ts (US2)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup).
2. Complete Phase 3 (US1) — the cursor-signing fix ships alone; it's the higher-priority,
   higher-visibility half of this feature (closes the constitution's explicitly-named MAC
   requirement).
3. **STOP and VALIDATE**: run quickstart.md §1-§3.

### Incremental Delivery

1. Setup → env var ready.
2. US1 → signed cursor ships (MVP).
3. US2 → opaque storage key ships.
4. Polish → docs/constitution record the closure; full regression pass.

---

## Notes

- [P] tasks touch different files and share no in-phase dependency.
- US1 and US2 are deliberately independent — do not let one block the other.
- Commit after each checkpoint, not necessarily after every task.

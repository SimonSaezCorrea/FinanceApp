# Feature Specification: Unified Row Identifiers

**Feature Branch**: `016-unified-row-ids`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "Unificar el formato de identificador de fila en todo el esquema (UUID v7) y validar su formato en el borde de la API, cerrando los puntos 1 y 2 de la deuda de conformidad con la constitución v2.0.0 (Principio VIII - Identificadores) documentada en docs/PENDING.md."

## Clarifications

### Session 2026-09-04

- Q: What shape should the rejection error take when a malformed id is submitted? → A: A single shared code `INVALID_ID_FORMAT` for any malformed id, with `field` distinguishing which one — following this API's existing `{error:{code,field}}` convention.
- Q: How strict should id-format validation be — any well-formed UUID, or specifically UUID v7? → A: Strictly require UUID v7. A well-formed UUID of a different version is rejected as malformed, consistent with there being no legacy production data to accommodate.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A malformed identifier is rejected at the edge, not deep in the stack (Priority: P1)

Today, an identifier arriving in a URL path (e.g. an account id) or in a request body (e.g. the
bank account a transaction belongs to) is accepted as any non-empty string. A typo, a stale
bookmark, or a hand-crafted request with a malformed id sails through validation and only fails
(or worse, silently misbehaves) once it reaches the database layer. A developer or API consumer
needs a clear, predictable, language-agnostic error the moment a malformed id is submitted —
consistent with how every other invalid-input case in this API already behaves.

**Why this priority**: This is the direct, externally observable fix — it changes what error a
caller gets today (an opaque failure surfaced from deep inside the request) into a clear
`400`-class rejection at the boundary. It is also the requirement the constitution names
explicitly as unmet (Principle VIII).

**Independent Test**: Send a request with an obviously malformed id (empty after trim, wrong
length, invalid characters, or a well-formed id of the wrong lineage) in a path parameter or a
body field that references another row, and confirm the API rejects it with a consistent error
code before any database query runs — independent of every other change in this feature.

**Acceptance Scenarios**:

1. **Given** any authenticated endpoint that takes a row id in its URL path, **When** a request
   is made with a path segment that is not a validly-formatted id, **Then** the API responds with
   a `400`-class error carrying a consistent, language-agnostic error code — never a `500`, never
   a silent no-op, never a query that reaches Postgres.
2. **Given** any endpoint whose request body references another row by id (e.g. creating a
   transaction with a bank account id), **When** that field is not a validly-formatted id,
   **Then** the API responds the same way as scenario 1, before attempting to persist anything.
3. **Given** a route that has both a literal segment (e.g. `/transactions/summary`) and a
   dynamic id segment (e.g. `/transactions/:id`) at the same path depth, **When** a request is
   made to the literal path, **Then** it is served by the literal-path handler, never
   misinterpreted as an id lookup — regardless of how id validation is implemented.

---

### User Story 2 - Every new row gets an identifier in the same format (Priority: P2)

Right now, most rows get their id from the database schema's own default, but five specific
write paths mint their own id in application code — and that code uses a different identifier
format than the schema default. Two formats have been quietly coexisting in the same identifier
column across the whole system. A developer creating a new row — through any of the existing
write paths, or a new one added later — needs every id to come from exactly one format, with no
special-cased exception.

**Why this priority**: This is the root cause User Story 1's validation would otherwise have to
special-case around. Fixing it prevents the two-formats problem from resurfacing the next time
someone adds a write path that mints its own id.

**Independent Test**: Trigger each of the five known write paths that mint their own id (paying a
credit statement, paying an installment, creating a transfer, uploading an attachment, creating an
installment plan) plus an ordinary create on any other domain, and confirm every resulting row's
id has the identical, single format.

**Acceptance Scenarios**:

1. **Given** a fresh database, **When** the schema is applied and seed data is generated,
   **Then** every row in every table has an id in the one agreed-upon format.
2. **Given** any of the five write paths that previously minted an id of the old, inconsistent
   format, **When** that operation is performed, **Then** the newly created row's id is in the
   same single format as every schema-default-generated id — not a second, different format.

---

### User Story 3 - The project's own claim about id validation is actually true (Priority: P3)

An existing acceptance criterion (from a prior architecture migration) asserts that malformed ids
are rejected at the API boundary. Today that claim is only trivially true — nothing currently
validates id format, so the check technically "passes" for the trivial reason that it was never
exercised. Anyone relying on that criterion to understand system behavior is misled.

**Why this priority**: This is documentation/verification hygiene riding on top of User Stories 1
and 2 — it has no independent behavior of its own, only value once those are done.

**Independent Test**: Re-run the existing acceptance check for that criterion after User Stories 1
and 2 are complete, and confirm it now exercises real rejection behavior instead of passing
trivially.

**Acceptance Scenarios**:

1. **Given** User Stories 1 and 2 are implemented, **When** the existing quickstart acceptance
   check for id validation is executed, **Then** it demonstrably fails against the pre-feature
   behavior and passes against the post-feature behavior (i.e., it is a real test, not a tautology).

---

### User Story 4 - A body-supplied reference to another row is verified as the caller's own before it is saved (Priority: P4)

Added 2026-09-04, extending this feature's scope by decision of the product owner (originally
tracked as a separate, deferred piece of conformance debt — see Assumptions). Five write paths
accept an id in the request body that is supposed to reference one of the caller's OWN rows (a
bank account to link a recurring expense/investment/instalment-plan payment source to, a bulk
import row's account, or the card an instalment plan was bought with) and, today, persist whatever
id was sent without checking it belongs to the caller. A well-formed id (now guaranteed by User
Story 1/2's format validation) that happens to belong to a DIFFERENT user is silently accepted.
One of the five is worse than silent acceptance: the card-ownership check already existing in the
system returns the same "nothing here" answer for "no card was sent" and "a foreign card was sent",
and the code treats both identically — the foreign id still gets saved.

**Why this priority**: Lower priority than User Stories 1-3 because this is a narrower, structurally
different defect (missing an authorization check, not a format-validation gap) that happens to have
been catalogued alongside them in the same conformance-debt list — it is included here by explicit
request rather than because it depends on the earlier stories technically (it doesn't).

**Independent Test**: As a second user, obtain the id of the first user's bank account (or card),
then as the first user submit a request to one of the five write paths naming that id; confirm the
request is rejected as not-found rather than silently succeeding.

**Acceptance Scenarios**:

1. **Given** a bank account belonging to user B, **When** user A submits `POST /import/transactions`
   with a row naming user B's account as `bankAccountId`, **Then** the request is rejected (404,
   the same code the account's own domain already uses for "not found") before any row is inserted.
2. **Given** a bank account belonging to user B, **When** user A submits `POST /investments` or
   `POST /recurring` (or their `PATCH` equivalents) naming user B's account as `bankAccountId`,
   **Then** the request is rejected the same way.
3. **Given** a bank account belonging to user B, **When** user A submits `POST /installments` or
   `PATCH /installments/:id` naming user B's account as `paymentAccountId`, **Then** the request is
   rejected the same way.
4. **Given** a credit card belonging to user B, **When** user A submits `POST /installments`
   naming user B's card as `cardId`, **Then** the request is rejected as not-found — specifically
   NOT treated as "no card was sent" (the pre-existing conflation this scenario closes).

---

### Edge Cases

- What happens when a path parameter is present but empty (e.g. a trailing slash produces an
  empty segment)? → Rejected the same as any other malformed id, not treated as "missing".
- What happens when an id is a well-formed UUID but of a version other than v7 (e.g. a v4 UUID)?
  → Rejected as malformed — validation checks specifically for the system's chosen UUID v7 shape,
  not any generic UUID.
- What happens to identifiers already stored under the old, inconsistent format when this ships?
  → Out of scope for migration: this system carries no production data today (confirmed by the
  product owner), so existing seed/dev data is regenerated rather than migrated in place.
- What happens when a business identifier (e.g. an institution's regulator code, a CBU, a
  catalogue key like `RUT-...`) is submitted somewhere? → Unaffected — business identifiers are
  separate columns with their own existing validation and are never the row's primary identifier;
  this feature does not touch them.
- What happens to an in-flight pagination cursor that embeds a row id, generated before this
  feature ships? → Out of scope for this feature (tracked separately); this feature only concerns
  itself with newly minted ids and validation of ids submitted by callers, not the cursor's own
  encoding.
- What happens when a body field naming another row is simply omitted (not sent at all)? → Treated
  as absent, same as before — ownership is only checked when a value is actually present; omitting
  an optional reference is not an error.
- What happens when a lookup used to resolve "does this id belong to the caller" returns nothing
  because the id doesn't exist AT ALL, versus existing but belonging to someone else? → Both answer
  identically (not-found) — from the caller's point of view these are indistinguishable, and telling
  them apart would leak which ids exist for other users.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST generate every row identifier, across every table, in exactly one
  agreed-upon format — with no table and no write path using a different format.
- **FR-002**: The system MUST NOT allow any code path to mint a row identifier using a different
  generator or format than the one standard, including the five write paths identified today that
  currently mint their own id outside the schema's default.
- **FR-003**: The system MUST validate the format of every row identifier accepted from a caller
  — whether it arrives as a URL path parameter or as a body field that references another row —
  before that value is used in any read or write operation.
- **FR-004**: When a caller submits an identifier that does not match the standard UUID v7 format
  — including a well-formed UUID of a different version — the system MUST reject the request with
  a `400`-class response carrying one single, shared error code (`INVALID_ID_FORMAT`) plus a
  `field` indicator of which identifier failed, following this API's existing `{error:{code,
field}}` convention, and MUST NOT execute a database query using that value first.
- **FR-005**: The system MUST continue to correctly route requests to literal path segments (e.g.
  `/transactions/summary`, `/transactions/transfers/:groupId`) rather than misinterpreting them as
  a dynamic id lookup, regardless of how id-format validation is implemented.
- **FR-006**: The system MUST leave business identifiers (regulator/institution codes, CBU/alias
  values, catalogue keys such as `RUT-`/`PSP-`/`AGF-` prefixes) unaffected — these are validated
  by their own existing rules and are never treated as row identifiers.
- **FR-007**: The system's documented acceptance criteria concerning id validation MUST be updated
  to verify real rejection behavior, replacing any criterion that currently passes only because
  the behavior it describes was never implemented.
- **FR-008**: The project's living documentation (architecture notes and governing principles)
  MUST be updated to record the chosen identifier format and the fact that format validation now
  occurs at the API boundary, so this is discoverable by future contributors without re-auditing
  the code.
- **FR-009**: For each of the five identified write paths (bulk transaction import's per-row
  `bankAccountId`; creating/updating an investment's `bankAccountId`; creating/updating a recurring
  expense's `bankAccountId`; creating/updating an instalment plan's `paymentAccountId`; creating an
  instalment plan's `cardId`), the system MUST verify — before persisting anything — that the
  referenced row belongs to the caller, rejecting the request as not-found otherwise.
- **FR-010**: The system MUST NOT conflate "no reference was supplied" with "a reference was
  supplied but does not belong to the caller (or does not exist)" — a resolver that answers both
  cases with the same "nothing" value MUST have its caller distinguish them before deciding what to
  do with the field, rather than silently treating a foreign reference as an absent one.

### Key Entities

- **Row identifier**: The primary identifier of a row in any of the system's tables. Today,
  inconsistently either of two different generated formats. After this feature, generated in
  exactly one format everywhere, and validated for that format whenever a caller supplies one.
- **Business identifier**: A separate, domain-meaningful identifier already modeled as its own
  column (e.g. an institution's regulatory code, a bank account's CBU) — explicitly distinct from,
  and unaffected by, the row identifier described above.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of rows across all tables, after a fresh schema apply and reseed, share a
  single identifier format — zero rows found in the previous, inconsistent format.
- **SC-002**: 100% of the API's identifier-bearing path parameters and body fields reject a
  malformed value (including a well-formed UUID of a version other than v7) with the single shared
  `INVALID_ID_FORMAT` error code, verified by an automated check per endpoint group.
- **SC-003**: Zero regressions — the full existing automated test suite (unit, integration, e2e)
  passes unchanged in intent after the format switch.
- **SC-004**: The previously trivially-passing acceptance criterion for id validation now fails
  when run against the old behavior and passes against the new behavior, confirmed by re-running
  it.
- **SC-005**: 100% of the five identified write paths reject a foreign-but-well-formed reference id
  with a not-found response before persisting anything, verified by an automated check per path
  (a second test user's row id, submitted by the first user).

## Assumptions

- The product owner has already decided the target identifier format: UUID v7 (time-ordered,
  broadly supported, improves index locality for keyset-style pagination). This spec does not
  re-open that choice.
- No production data exists for this system today; therefore no in-place data migration is
  required — a schema reset and reseed is an acceptable way to reach the unified format for
  existing (development-only) rows.
- Business identifiers (institution codes, CBU, catalogue keys) are already out of scope by
  design — they are separate columns with separate validation, never the primary row identifier.
- The pagination cursor's own encoding (separately tracked as its own piece of conformance debt)
  is not addressed by this feature, even though it currently embeds a row identifier.
- User Story 4 was added by explicit product-owner decision (2026-09-04) to extend this feature's
  scope rather than open a separate spec, even though it addresses a structurally different gap
  (missing authorization, not missing format validation) than User Stories 1-3. The five write
  paths it covers are exactly the ones already catalogued as unverified in the constitution's own
  conformance-debt audit — no new paths were discovered or added to scope beyond that list.
  Two other write paths mentioned in that same audit (`POST /transactions`'s `cardId`,
  `POST /wallet`'s account/card ids) are OUT of scope here because they were cited as the ALREADY-
  CORRECT pattern to mirror, not as broken — verified by reading both handlers, not assumed from
  the audit text. This story closes exactly the five paths the audit actually flagged as unverified.
- "Consistent, language-agnostic error code" means following this API's existing error-shape
  convention (`{ error: { code, field? } }`) rather than introducing a new error response shape.

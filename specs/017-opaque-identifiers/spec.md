# Feature Specification: Opaque Cursor & Storage Key

**Feature Branch**: `017-opaque-identifiers`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "Firmar el cursor de paginación de movimientos y hacer opaca la clave
de almacenamiento de los comprobantes adjuntos — puntos 5 y 6 de la deuda de conformidad con la
constitución v2.0.0 (docs/PENDING.md)."

## Clarifications

### Session 2026-09-04

- Q: Should the new attachment storage location keep any non-identifying structure (e.g. an
  upload-date prefix) for operational browsability, or be fully flat? → A: Fully flat — a pure
  opaque random value with no folder/prefix structure at all.
- Q: Should the cursor-signing secret support rotation (multiple valid keys active at once) from
  day one, or is a single static secret acceptable for now? → A: A single static secret, matching
  this project's existing `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` pattern — rotating it invalidates
  every in-flight cursor, which is acceptable since a cursor's whole lifetime is one scroll.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A forged or corrupted pagination cursor is rejected, not silently trusted (Priority: P1)

Today, the cursor a client hands back to keep scrolling through movements is a plain, unsigned
encoding of a real row's date and id. Anyone can decode it to read that row's id, or hand back a
value they invented themselves, and the server has no way to tell a genuine cursor (one it issued)
from a forged one. A developer or API consumer needs the server to only ever honor a cursor it
actually issued.

**Why this priority**: This is the direct, externally observable fix — it changes the cursor from
"whatever shape happens to decode" to "verifiably issued by this server." It is also the specific
requirement the constitution names as unmet.

**Independent Test**: Take a validly-encoded cursor, tamper with any byte of it, and confirm the
next page request is rejected with the existing `INVALID_CURSOR` error rather than silently
returning some page of data.

**Acceptance Scenarios**:

1. **Given** a cursor issued by a previous page response, **When** it is sent back unmodified on
   the next request, **Then** the next page of results is returned exactly as today.
2. **Given** a cursor with any byte altered (a forged id, a shifted date, random tampering),
   **When** it is sent as `?cursor=`, **Then** the request is rejected with the same `INVALID_CURSOR`
   error the system already defines — before any database query runs using values decoded from it.
3. **Given** a syntactically well-formed cursor from a different, incompatible format version (e.g.
   one issued before this feature shipped), **When** it is sent as `?cursor=`, **Then** it is
   rejected with `INVALID_CURSOR` rather than being misinterpreted.

---

### User Story 2 - A comprobante's storage location reveals nothing about who owns it (Priority: P2)

Today, the storage key for an uploaded receipt/voucher embeds the owning user's id and the
transaction's id in plain text, and that full key travels inside the temporary signed URL a
browser uses to view the file — meaning a user's id can leak into browser history, an address bar,
a `Referer` header, or an intermediate cache. A developer needs a newly uploaded attachment's
storage location to reveal nothing about the resource it belongs to.

**Why this priority**: Narrower blast radius than User Story 1 (requires an attachment to have been
uploaded and its URL to have been captured somewhere) and structurally independent of it, but still
a real, constitution-named gap — this is the one path by which a user id leaves the app outside the
JWT.

**Independent Test**: Upload a new attachment and inspect the storage key the system records for
it; confirm it contains neither the uploading user's id nor the transaction's id as a readable
substring, while the attachment still uploads, lists, and opens exactly as before.

**Acceptance Scenarios**:

1. **Given** a user uploads a receipt to one of their movements, **When** the system records where
   it was stored, **Then** that stored location does not contain the user's id or the movement's id
   as a substring.
2. **Given** an attachment uploaded under this feature, **When** its list entry or its signed
   viewing URL is requested, **Then** both work exactly as they did before this feature — the
   change is invisible to the end user.
3. **Given** two attachments uploaded to the same movement with identical original file names,
   **When** both are stored, **Then** each still gets its own distinct location (no collision).

---

### Edge Cases

- What happens to a cursor a client is mid-scroll with at the moment this ships? → It stops
  validating (a different format now) and the client's next request for that cursor gets
  `INVALID_CURSOR` — acceptable, a cursor's whole lifetime is one scrolling session, and the client
  already has to handle that error to restart from the top.
- What happens when the cursor's date/id payload itself is well-formed but the accompanying
  authenticity check simply doesn't match (someone flipped one character)? → Same outcome as a
  fully invented cursor: rejected as `INVALID_CURSOR`. The system does not attempt to distinguish
  "slightly wrong" from "completely fabricated."
- What happens to attachments already stored under the old, identifying key format before this
  ships? → Out of scope for migration: this system carries no production data today (confirmed by
  the product owner — same standing assumption as prior conformance-debt work), so no real objects
  exist under the old format to reconcile.
- What happens to the original uploaded file name once the storage location no longer encodes it?
  → Unaffected — the file name shown in the UI already lives in its own separate, existing field and
  was never read from the storage location; only the storage location itself changes shape.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST reject a pagination cursor whose authenticity cannot be verified
  (any tampering, forgery, or corruption) with the same not-a-silent-success error the system
  already uses for an invalid cursor, before using any value decoded from it in a query.
- **FR-002**: The system MUST embed a way to distinguish which cursor format version issued a given
  cursor, and MUST reject a cursor whose version it does not recognize the same way as an
  unverifiable one — rather than attempting to interpret it under the wrong rules.
- **FR-003**: A cursor issued by the system and returned unmodified on the very next request MUST
  continue to produce the correct next page of results — this feature changes what an invalid
  cursor does, not what a valid one does.
- **FR-004**: The system MUST generate, for every newly uploaded attachment, a storage location
  that does not contain the uploading user's id or the owning transaction's id as a readable
  substring — a fully flat opaque value, with no folder/prefix structure of any kind (not even a
  non-identifying one such as an upload date).
- **FR-005**: The system MUST continue to guarantee that no two attachments ever resolve to the
  same storage location, regardless of how many attachments share a movement or an original file
  name.
- **FR-006**: The system MUST NOT change any other externally observable behavior of uploading,
  listing, or viewing an attachment — the original file name a user sees, download behavior, and
  the signed-URL viewing flow are unaffected.
- **FR-007**: The project's living documentation (architecture notes and governing principles) MUST
  be updated to record both changes, so this is discoverable by future contributors without
  re-auditing the code.

### Key Entities

- **Pagination cursor**: An opaque token a client holds and returns to continue a paginated list.
  Today, a plain encoding of a real row's identifying values. After this feature, additionally
  carries proof that the server itself issued it, tagged with the format version that produced it.
- **Attachment storage location**: Where an uploaded file's bytes live in object storage. Today,
  built from the ids of the resources it belongs to. After this feature, an opaque value bearing no
  relationship to those ids, while the mapping from an attachment record to its bytes is preserved
  exactly as before.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of tampered, forged, or wrong-version cursors submitted to the paginated list
  endpoint are rejected before any database query uses values decoded from them, verified by an
  automated check.
- **SC-002**: 100% of freshly issued, unmodified cursors continue to page through results
  correctly — zero regressions in the existing scrolling experience.
- **SC-003**: 100% of newly uploaded attachments get a storage location containing neither the
  owning user's id nor the owning transaction's id as a substring, verified by an automated check.
- **SC-004**: Zero regressions in existing attachment upload/list/view behavior, confirmed by the
  full existing automated test suite passing unchanged in intent.

## Assumptions

- No production data exists for this system today (confirmed by the product owner, consistent with
  prior conformance-debt work in specs/015/016) — so no migration of already-issued cursors or
  already-stored attachment objects under the old key format is required.
- The product owner has explicitly decided that API-versioning policy (a separate, previously
  identified conformance-debt item) is out of scope here — this system has no external consumers
  today or planned, only applications the product owner controls, so that gap is deliberately left
  open and not addressed by this feature.
- "The same not-a-silent-success error the system already uses for an invalid cursor" refers to the
  existing `INVALID_CURSOR` domain error this system already defines and returns for a malformed
  cursor today — this feature widens what triggers it, not its shape or code.
- A cursor's authenticity check requires a server-side secret; a single static secret (matching
  this project's existing authentication-token secret pattern) is sufficient — key rotation with
  multiple simultaneously-valid secrets is explicitly out of scope, and changing the secret is
  expected to invalidate every cursor currently in flight (acceptable, per Edge Cases above).

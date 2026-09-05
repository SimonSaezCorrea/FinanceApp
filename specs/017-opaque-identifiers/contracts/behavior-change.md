# Contract: Behavior Change (no new endpoint, no new response shape)

Neither User Story introduces a new endpoint or changes a response envelope. This documents the
one observable behavior delta on each existing surface.

## `GET /transactions?cursor=...`

**Unchanged**: request/response shape, `nextCursor` still a single opaque string the client must
treat as a value to hand back untouched. A freshly issued, unmodified cursor pages exactly as
before (spec FR-003/SC-002).

**Changed**: what makes a cursor invalid.

| Input                                              | Before                                                                                | After                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| Freshly issued cursor, unmodified                  | Accepted                                                                              | Accepted (unchanged)             |
| Any byte of the cursor altered                     | Accepted if it still happened to parse as `<date>\|<id>` — a forged cursor could work | `400 INVALID_CURSOR`             |
| A cursor from a future/incompatible format version | N/A (no versioning existed)                                                           | `400 INVALID_CURSOR`             |
| Syntactically garbage string                       | `400 INVALID_CURSOR` (already true today)                                             | `400 INVALID_CURSOR` (unchanged) |

## `POST /transactions/:id/attachments` (upload) and its listing/viewing endpoints

**Unchanged**: upload response shape, `GET .../attachments` list shape, the signed-URL viewing
flow, `fileName` shown in the UI, `@unique` guarantee against collisions (spec FR-005/FR-006).

**Changed**: the `storageKey` value recorded for a newly uploaded attachment no longer contains the
uploader's `userId` or the owning `transactionId` as a readable substring (spec FR-004) — this
value is never returned to the client directly (only ever used server-side to fetch/delete the
object or produce a short-lived signed URL), so no request/response shape changes; only what a
reverse-engineered signed URL would reveal, if captured, changes.

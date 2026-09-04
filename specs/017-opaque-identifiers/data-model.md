# Data Model: Opaque Cursor & Storage Key

No new table, no schema column change. Both changes are to values ALREADY generated at these two
points — this document records their before/after shape.

## Pagination cursor (`Transaction` list, keyset pagination)

- **Column of the schema it's derived from**: none directly — built from `Transaction.occurredAt`
  + `Transaction.id` (both already exist), never itself stored.
- **Before**: `base64url("<occurredAt ISO8601>|<id>")` — unsigned, unversioned.
- **After**: `base64url("<version>|<occurredAt ISO8601>|<id>") + "." + base64url(HMAC-SHA256(secret,
  that payload))` — see research.md Decision 1. Same two source values (`occurredAt`, `id`), now
  wrapped in a version tag and an authenticity proof.
- **Validated**: on every `GET /transactions?cursor=...` request, before the decoded `occurredAt`/
  `id` are used in the keyset query. A MAC mismatch or unrecognized version → `INVALID_CURSOR`
  (existing domain error, `transaction/domain/errors.ts`), same as today's malformed-cursor case.
- **New environment dependency**: `CURSOR_SIGNING_SECRET` (research.md Decision 2) — required at
  boot the same way `JWT_ACCESS_SECRET` already is (`getOrThrow`, fails fast rather than silently
  running unsigned).

## Attachment storage key (`TransactionAttachment.storageKey`)

- **Column**: `TransactionAttachment.storageKey String @unique` — format changes, constraint
  (`@unique`) and column type do not.
- **Before**: `u/<userId>/t/<transactionId>/<attachmentId>-<slug-of-original-filename>`.
- **After**: a fresh, independent `randomUUID()` (v4) — no path segments, no derivation from
  `userId`/`transactionId`/`attachmentId`/filename (research.md Decision 3).
- **Unaffected**: `TransactionAttachment.fileName` (separate column, already the sole source for
  what the UI displays — never read from `storageKey`), `contentType`, `sizeBytes`, the `@unique`
  guarantee itself (still enforced by Postgres on whatever value is written).
- **Existing rows**: untouched — old-format keys already in a developer's local database keep
  working against whatever their local bucket has under those exact keys; only new uploads get the
  new format (research.md Decision 4).

## No new error, no new success response shape

Both changes are internal to how an already-returned value (`nextCursor`, `storageKey`) is built or
validated — the HTTP response shapes (`transactions.TransactionPage`, `transactions.Attachment`)
are unchanged. The only user-visible change is `INVALID_CURSOR` now firing for a wider set of
inputs (any tampered/unversioned cursor, not just a syntactically malformed one) — same code, same
`400`, same `{error:{code,field}}` shape it already returns today.

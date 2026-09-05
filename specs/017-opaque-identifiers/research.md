# Research: Opaque Cursor & Storage Key

## Decision 1 — Cursor signing scheme

**Decision**: `token = base64url(payload) + "." + base64url(hmac)`, where
`payload = "<version>|<occurredAt ISO8601>|<id>"` and
`hmac = HMAC-SHA256(secret, payload)` (full 32-byte digest, not truncated). `version` is a single
digit (`"1"` today), included INSIDE the signed payload so a version-downgrade attempt is itself
caught by the MAC check, not by a separate unsigned check. Verification: split on the single `.`
(exactly 2 parts, else `INVALID_CURSOR`); base64url-decode the payload; recompute the HMAC over it
with the same secret; compare against the decoded second part using `crypto.timingSafeEqual`
(constant-time, avoids a timing side-channel on the comparison itself — cheap to do right, no
reason not to); if the MAC doesn't match, or a decoded version doesn't equal the current one,
throw `InvalidCursorError` (reusing the domain's existing error, per spec FR-001/FR-002 — this
feature widens what triggers it, not its shape).

**Rationale**: A dot-separated two-part token (payload, then MAC) avoids nesting one base64
encoding inside another and makes the split trivial and unambiguous — matches the shape of a JWT's
own `header.payload.signature` convention this project's auth already uses, so it's not
introducing an unfamiliar pattern. Putting the version inside the MAC-covered payload (rather than
as an unsigned prefix) is deliberate: an unsigned version tag could be forged to select a
weaker/older verification path if one ever existed side-by-side during a migration — signing it
closes that off even though this project has no such migration today.

**Alternatives considered**:

- Truncating the HMAC to save bytes (e.g. 16 of 32 bytes) — rejected, the cursor already isn't
  size-constrained (one query param) and a shorter MAC is a weaker one for no real benefit here.
- A single base64url blob with the MAC appended before encoding (`base64url(payload + mac)`) —
  rejected, splitting a fixed-length binary MAC back out of a decoded byte string is more fragile
  than splitting on a `.` that can never appear inside either base64url segment.
- JWT itself (`@nestjs/jwt`, already a dependency) for the cursor — rejected, a JWT's overhead
  (header, standard claims, larger encoded size for a value that rides in a URL query string on
  every scroll request) buys nothing a 2-part HMAC token doesn't already provide, and this project's
  JWTs are reserved for authentication, not pagination state.

## Decision 2 — Where the signing secret lives and how it's read

**Decision**: New env var `CURSOR_SIGNING_SECRET`, declared in `apps/api/.env.example` next to
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (same "change-me-…" placeholder convention). Read via a
new plain function `getCursorSigningSecret(config: ConfigService): string` in
`apps/api/src/infra/config/cursor.config.ts` (`config.getOrThrow("CURSOR_SIGNING_SECRET")`),
mirroring the existing `readS3Config(config)` helper in the same directory — a plain function
taking `ConfigService` as a parameter, not a NestJS-injectable class of its own.

**Rationale**: `transaction-cursor.ts`'s `encodeCursor`/`decodeCursor` are today plain, dependency-free
functions — keeping them that way (accepting the secret as an explicit parameter, resolved once by
the caller) preserves their unit-testability without a NestJS testing harness, and matches this
project's own architecture norm that only `infrastructure/`-layer code (or, here, the query
handler acting as the composition point) touches `ConfigService` — the domain/application functions
themselves stay pure. `ListTransactionsQueryHandler` injects `ConfigService`, resolves the secret
once, and passes it to both functions.

**Alternatives considered**:

- Reading `process.env.CURSOR_SIGNING_SECRET` directly inside `transaction-cursor.ts` — rejected,
  a grep across `apps/api/src/domains` confirms zero existing direct `process.env` reads in
  domain/application code; every other secret goes through `ConfigService`, and this shouldn't be
  the first exception.
- Promoting the cursor codec to a full `@Injectable()` class — rejected as unnecessary ceremony;
  the plain-function-plus-explicit-parameter shape already used by `readS3Config` solves the same
  problem with less code.

## Decision 3 — Opaque attachment storage key

**Decision**: `storageKeyFor` drops its `userId`/`transactionId`/`attachmentId`/filename-slug
input entirely and instead returns `randomUUID()` (Node's `node:crypto`, RFC 4122 v4 — genuinely
random, no embedded timestamp) with no prefix, no path segments, nothing else appended. Per the
clarified spec decision, this is deliberately flat — no upload-date or any other non-identifying
grouping.

**Rationale**: UUID v4 was chosen over reusing this project's own `generateRowId()` (UUID v7,
established in specs/016) specifically because v7 embeds a 48-bit millisecond timestamp in its
first bits — while that doesn't identify a USER or a RESOURCE (satisfying the letter of the
constitution's rule), it does leak an approximate upload time to whoever holds a signed URL, and
the point of this story is for the storage location to reveal nothing extractable at all. A row's
own `id` column (this table included) stays UUID v7 for the reasons specs/016 established
(index locality, keyset-pagination friendliness) — `storageKey` is not a row identifier, it's an
opaque bucket key, a different concept with a different goal, so it doesn't inherit that choice.
Uniqueness is already guaranteed by the existing `@unique` constraint on the column — a fresh
random v4 UUID's collision probability is negligible at this project's scale, same guarantee any
random-UUID-keyed system relies on.

**Rationale for dropping the filename slug specifically**: it was already redundant — the original
file name is preserved in its own `fileName` column and was never read back from the storage key
by any caller (confirmed by grep: only `RemoveAttachmentHandler` and `ListAttachmentsHandler` read
`storageKey`, both treat it as an opaque lookup key, never parse it).

**Alternatives considered**:

- Keeping a hash of the identifying values instead of fresh randomness (e.g.
  `sha256(userId+transactionId+attachmentId)`) — rejected: a hash of known inputs is still
  effectively derived from them (anyone who can guess/enumerate the inputs can verify a match),
  which doesn't satisfy "does not derive from" as robustly as independent randomness with no
  relationship to the inputs at all.
- `generateRowId()` (UUID v7) for consistency with every other id in the schema — rejected per the
  timestamp-leak reasoning above; noted explicitly so a future reader doesn't "fix" this into v7
  thinking it was an oversight.

## Decision 4 — No migration path needed

**Decision**: No script, no dual-read compatibility shim for old-format storage keys or old-format
cursors. Existing `TransactionAttachment` rows in a developer's local database keep whatever
storage key they already have (harmless — the OLD key format still resolves correctly against
whatever the developer's local bucket has under it); only NEWLY uploaded attachments get the new
opaque format. In-flight cursors simply stop validating after deploy (spec Edge Cases: acceptable,
a cursor lives one scroll).

**Rationale**: Matches the standing assumption already used by specs/015/016 (no production data
exists for this system). Unlike specs/016's id-format unification, this feature does NOT need a
`db:reset`/reseed at all — nothing about the schema changes (no new column, no default change),
only what NEW writes look like going forward, so old rows are simply never touched.

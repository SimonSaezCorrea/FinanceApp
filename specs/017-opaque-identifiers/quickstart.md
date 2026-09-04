# Quickstart: Opaque Cursor & Storage Key

Prerequisites: `apps/api/.env` has `CURSOR_SIGNING_SECRET` set (new — copy `.env.example`'s
placeholder and change it, same as `JWT_ACCESS_SECRET`), Postgres running.

## 1. A cursor is signed and round-trips correctly (SC-002)

```bash
# Load the first page
curl -s "$API_URL/api/v1/transactions?limit=5" -H "Cookie: $AUTH_COOKIE" | jq '.nextCursor'
# Feed that exact value back — must return the correct next page, unchanged behavior
curl -s "$API_URL/api/v1/transactions?limit=5&cursor=<value from above>" -H "Cookie: $AUTH_COOKIE" | jq
```

## 2. A tampered cursor is rejected (SC-001, User Story 1)

```bash
# Flip one character of a real cursor (or hand-craft `base64url("1|2026-01-01|fake").anything`)
curl -s "$API_URL/api/v1/transactions?cursor=tampered-or-invented-value" \
  -H "Cookie: $AUTH_COOKIE" | jq
# expect: 400, { "error": { "code": "INVALID_CURSOR", "field": "cursor" } }
```

## 3. A well-formed but unversioned/old-format cursor is rejected

```bash
# The OLD (pre-feature) unsigned encoding, still syntactically plausible:
OLD=$(node -e 'console.log(Buffer.from("2026-01-01T00:00:00.000Z|some-id").toString("base64url"))')
curl -s "$API_URL/api/v1/transactions?cursor=$OLD" -H "Cookie: $AUTH_COOKIE" | jq
# expect: 400 INVALID_CURSOR — no "." separator, doesn't even parse as the new 2-part shape
```

## 4. A new attachment's storage key is opaque (SC-003, User Story 2)

Requires S3-compatible storage configured (`S3_BUCKET` etc. in `.env`) — otherwise upload answers
`503 ATTACHMENTS_UNAVAILABLE` and this step can be verified at the unit/integration level instead
(see tasks.md).

```bash
curl -s -X POST "$API_URL/api/v1/transactions/$TX_ID/attachments" \
  -H "Cookie: $AUTH_COOKIE" -F "file=@boleta.pdf"
```

Then inspect the row directly:

```bash
psql "$DATABASE_URL" -c "select \"storageKey\" from \"transaction-attachment\" order by \"createdAt\" desc limit 1;"
```

Confirm the printed value contains neither `$USER_ID` nor `$TX_ID` as a substring, and has no `/`
in it at all (fully flat, per the clarified spec decision).

## 5. Upload/list/view still work end-to-end (SC-004)

```bash
curl -s "$API_URL/api/v1/transactions/$TX_ID/attachments" -H "Cookie: $AUTH_COOKIE" | jq
curl -s "$API_URL/api/v1/transactions/$TX_ID/attachments/$ATTACHMENT_ID/url" -H "Cookie: $AUTH_COOKIE" | jq
```

## 6. No regressions

```bash
pnpm --filter @finance/api test
pnpm --filter @finance/api test:integration
pnpm --filter @finance/api test:e2e
pnpm typecheck
```

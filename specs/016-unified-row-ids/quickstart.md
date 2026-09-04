# Quickstart: Validating Unified Row Identifiers

Prerequisites: `pnpm install`, `apps/api/.env` configured (`DATABASE_URL` at minimum), Postgres
running.

## 1. Reset the database to the new id format (SC-001)

```bash
pnpm db:reset
```

Then confirm every row's `id` is a UUID v7 (version nibble `7`):

```bash
# from apps/api, against the dev DB — spot-check a handful of tables
psql "$DATABASE_URL" -c "select id from \"bank-account\" limit 5;"
psql "$DATABASE_URL" -c "select id from \"transaction\" limit 5;"
```

Every value returned must match `xxxxxxxx-xxxx-7xxx-Nxxx-xxxxxxxxxxxx` (13th hex group starts
with `7`).

## 2. Application-minted ids match the same format (User Story 2)

Exercise each of the five write paths that used to call `randomUUID()` and confirm the resulting
id/correlation value is UUID v7, not v4:

- Create an installment plan (`POST /installments`) → inspect the created plan's `id`.
- Pay an installment (`POST /installments/:id/payments/:seq/pay`) → inspect the created movement's
  `transactionId`.
- Pay a credit statement (`POST /accounts/:id/credit-statements/:statementId/pay`) → inspect the
  created payment movement's id.
- Create a transfer (`POST /transactions/transfers`) → inspect `transferGroupId`.
- Upload an attachment (`POST /transactions/:id/attachments`, requires S3 configured) → inspect
  `attachmentId`.

## 3. A malformed id is rejected at the boundary, not deep in the stack (User Story 1, SC-002)

```bash
# malformed path param
curl -s -X GET "$API_URL/api/v1/accounts/not-a-real-id" \
  -H "Cookie: $AUTH_COOKIE" | jq
# expect: 400, { "error": { "code": "INVALID_ID_FORMAT", "field": "id" } }

# well-formed UUID but wrong version (v4) — also rejected
curl -s -X GET "$API_URL/api/v1/accounts/$(node -e 'console.log(require("crypto").randomUUID())')" \
  -H "Cookie: $AUTH_COOKIE" | jq
# expect: same 400 INVALID_ID_FORMAT — a v4 UUID is well-formed but not v7

# malformed body field
curl -s -X POST "$API_URL/api/v1/transactions" \
  -H "Cookie: $AUTH_COOKIE" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(node -e 'console.log(require("crypto").randomUUID())')" \
  -d '{"type":"EXPENSE","amount":"10.00","currency":"CLP","bankAccountId":"nope","occurredAt":"2026-09-04"}' \
  | jq
# expect: 400 INVALID_ID_FORMAT, field "bankAccountId" — before any Prisma query
```

## 4. Literal routes still win over `:id` (Acceptance Scenario 3)

```bash
curl -s -X GET "$API_URL/api/v1/transactions/summary" -H "Cookie: $AUTH_COOKIE" | jq
# expect: the summary aggregate response, never INVALID_ID_FORMAT (which would mean "summary" was
# mistakenly parsed as an :id)
```

## 5. specs/009 SC-007 now exercises real behavior (User Story 3, SC-004)

```bash
curl -s -X GET "$API_URL/api/v1/accounts/not-a-real-id/credit-statements" \
  -H "Cookie: $AUTH_COOKIE" | jq
# expect: 400 INVALID_ID_FORMAT — before this feature this fell through to a 200 with an empty
# list or a generic 404, never a validation rejection
```

## 6. No regressions (SC-003)

```bash
pnpm --filter @finance/api test
pnpm --filter @finance/api test:integration
pnpm --filter @finance/api test:e2e
pnpm --filter @finance/contracts test
pnpm typecheck
```

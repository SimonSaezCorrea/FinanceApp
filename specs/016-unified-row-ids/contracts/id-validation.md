# Contract: Row-Identifier Validation

Applies uniformly to every existing endpoint under `/api/v1` that accepts a row identifier — no new
endpoint is introduced by this feature. This document specifies the contract change; per-endpoint
route lists already exist in each domain's own controller and are not duplicated here.

## Request

Any of the following, previously accepted as any non-empty string:

- A URL path parameter naming a row (`:id`, `:cardId`, `:accountId`, `:statementId`, `:groupId`,
  `:walletItemId`, etc. — every path param **except** `:seq`, which is a positive integer sequence
  number, not a row id).
- A body field referencing another row by id (`bankAccountId`, `cardId`, `installmentPlanId`,
  `paymentAccountId`, `savingsGoalId`, `institutionId`, `countryId`, `creditStatementId`, and
  every other field of this shape across the domain schemas).

**New format constraint**: MUST be a canonical UUID version 7 string (RFC 9562), e.g.
`018f6b9a-2c3e-7c21-9e4a-1f2b3c4d5e6f`. A well-formed UUID of any other version (v1, v4, etc.) is
rejected — not just an arbitrary malformed string.

## Response — malformed identifier

```json
{
  "error": {
    "code": "INVALID_ID_FORMAT",
    "field": "cardId"
  }
}
```

- **Status**: `400 Bad Request`.
- **`field`**: the dotted path of the offending field (path param name, or body field name/path for
  a nested field).
- Same shape as every other domain error today (`{ error: { code, field? } }`) — no new envelope.
- No database query is made using the offending value before this response is produced.

## Response — well-formed but nonexistent identifier

Unchanged by this feature: a syntactically valid UUID v7 that does not correspond to any row (or
belongs to another user) continues to produce the existing not-found/ownership behavior for that
endpoint (typically `404`), not `INVALID_ID_FORMAT`. Format validity and existence/ownership are
two separate, sequential checks — this feature only adds the first one where it was previously
entirely absent.

## Unaffected surfaces

- Business identifiers (institution `code`, CBU, `RUT-`/`PSP-`/`AGF-` catalogue keys) — validated
  by their own existing schemas, untouched.
- The keyset pagination cursor (`?cursor=`) — it embeds a row id internally but is validated as an
  opaque cursor string, not as a bare id field; its own signing/format is separately tracked
  conformance debt (docs/PENDING.md point 5), not in scope here.
- `:seq` (installment payment sequence number) — stays `z.coerce.number().int().positive()`.

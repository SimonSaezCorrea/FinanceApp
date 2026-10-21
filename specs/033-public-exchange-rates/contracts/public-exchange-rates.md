# Contract: `GET /api/v1/public/exchange-rates`

Public (no session, no cookies read), read-only, global reference data. Same query and handler as
the authed `GET /api/v1/exchange-rates` (specs/030), which keeps its guard and its shape plus the
additive `first` field.

## Request

Query (`exchangeRates.listExchangeRatesQuerySchema`, unchanged):

| Param      | Type           | Default        |
| ---------- | -------------- | -------------- |
| `currency` | `USD` \| `CLF` | both           |
| `from`     | `YYYY-MM-DD`   | `to − 30 days` |
| `to`       | `YYYY-MM-DD`   | today (Chile)  |

Errors (unchanged codes): `400 INVALID_DATE_RANGE` (`from > to`), `400 EXCHANGE_RANGE_TOO_LARGE`
(> 400 days), `400` validation for malformed params.

## Response `200`

```json
{
  "items": [
    { "currency": "CLF", "date": "2026-10-21", "value": "39876.5400", "valueDate": "2026-10-21" }
  ],
  "latest": { "USD": { "...": "..." }, "CLF": { "...": "..." } },
  "first": { "USD": "2025-10-08", "CLF": "2025-10-08" }
}
```

- `items`: newest first, only `currency` when given.
- `latest`: newest row of each currency, whatever the range.
- `first` (NEW, additive, optional in the schema so an older API still parses): oldest `date` of each currency, `null` on an empty table. This API always sends it.

Headers: `Cache-Control: public, max-age=300`. No `Set-Cookie`. CORS: the site's origin is already
in `CORS_ORIGIN`; the page calls it without credentials.

## Guarantees

- Reads only the `exchange-rate` table; no user data, no write (FR-016).
- Same rows as the app for the same day (FR-004).
- Not idempotency-relevant (GET).

# API Contract Conventions

The HTTP API is the **sole** integration surface between `apps/web` and `apps/api` (FR-003). All
shapes are defined once as zod schemas in `packages/contracts` and inferred into TS types used by
both sides.

## Transport & format

- REST over HTTP/JSON. Base path `/api/v1`. Frontend targets it via `VITE_API_URL`.
- Resources are namespaced by domain: `/api/v1/{domain}/...`.
- **Money fields are JSON strings** (e.g. `"1240.5000"`), never numbers — parsed with `decimal.js`.
- Dates are ISO-8601 strings (UTC).

## Auth

- `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `POST /api/v1/auth/refresh`,
  `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- Access + refresh **JWT in httpOnly cookies**; refresh rotation on `/refresh`.
- CORS allows the web origin with credentials; CSRF protection on state-changing requests.
- Every non-auth endpoint requires a valid access token and is **scoped to the authenticated
  `userId`** server-side (Principle II) — the client never sends a userId.

## Errors (language-agnostic — clarify Q1)

The API never returns localized prose. Error body:

```json
{ "error": { "code": "TRANSACTION_NOT_FOUND", "field": "id", "details": {} } }
```

- `code` is a stable SCREAMING_SNAKE key; the **frontend** maps codes → es/en messages.
- Standard HTTP statuses: 400 (validation), 401 (no/invalid session), 403, 404, 409, 422, 500.
- Validation errors return field-level `code`s derived from the shared zod schema.

## Per-domain endpoint map (CRUD baseline)

| Domain       | Endpoints (under `/api/v1`)                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| accounts     | `GET/POST /accounts`, `GET/PATCH/DELETE /accounts/:id`                                                     |
| transactions | `GET/POST /transactions`, `GET/PATCH/DELETE /transactions/:id` (filter by date/account/type)               |
| installments | `GET/POST /installments`, `GET/PATCH/DELETE /installments/:id`, `POST /installments/:id/payments/:seq/pay` |
| debts        | `GET/POST /debts`, `GET/PATCH/DELETE /debts/:id`, `POST /debts/:id/settle`                                 |
| savings      | `GET/POST /savings/goals`, `GET/PATCH/DELETE /savings/goals/:id`, `POST /savings/entries`                  |
| investments  | `GET/POST /investments`, `GET/PATCH/DELETE /investments/:id`, `GET /investments/etf/:symbol/quote`         |
| import       | `POST /import/transactions` (multipart Excel; parsed server-side)                                          |
| auth         | see Auth section                                                                                           |

## Versioning

- Path-versioned (`/v1`). Breaking contract changes bump the version; the shared `packages/contracts`
  carries the version so both apps move together.

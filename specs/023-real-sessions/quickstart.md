# Quickstart: Sesiones y dispositivos reales

## Prerequisites

- `pnpm db:push` applied (new `Session` table, no migration file needed — dev DB only).
- Optional: `GEOIP_DB_PATH` set to a real GeoLite2-Country `.mmdb` file to see a country
  in the list. Without it, sessions still work, just with `country: null` (research.md
  R5) — this is the expected/tested "inert" path, not a failure.

## US1 — Ver mis sesiones activas

1. Log in as the seeded demo user (`test@finance.local` / `demo1234`) from one browser.
2. `GET /auth/sessions` (or open Perfil → Seguridad → "Sesiones y dispositivos") — expect
   exactly one row, `isCurrent: true`, with a `deviceLabel` matching the browser used.
3. Log in again from a second browser/profile with the same account.
4. Reload the list from either browser — expect two rows now, only one marked
   `isCurrent` (the one whose access token is making the request).

## US2 — Cerrar una sesión individual

1. With two active sessions (per US1), call
   `DELETE /auth/sessions/:id` for the NON-current one.
2. `GET /auth/sessions` from the current browser — expect only one row left.
3. From the OTHER (now-closed) browser, attempt any authenticated request (e.g.
   `GET /auth/me`) — expect `401` immediately (research.md R2 — no 15-minute grace
   period on the still-technically-unexpired access token).
4. Confirm the browser used to close the session was never affected — its own requests
   keep succeeding throughout.

## US3 — Cerrar todas las demás sesiones

1. Log in from three browsers/profiles (A, B, C) with the same account.
2. From A, call `POST /auth/sessions/revoke-others`.
3. `GET /auth/sessions` from A — expect exactly one row (A itself).
4. From B and C, any authenticated request fails with `401` right away.
5. From A, requests keep succeeding without interruption.

## Edge cases to confirm manually

- A session whose refresh token lifetime has elapsed (or run the cleanup cron early)
  disappears from `GET /auth/sessions` on its own — no explicit close needed
  (FR-007/SC-004).
- Calling `POST /auth/sessions/revoke-others` with only one active session (the current
  one) succeeds as a no-op — `204`, zero rows affected, no error.
- `DELETE /auth/sessions/:id` on an id that isn't the caller's own (or doesn't exist)
  answers `404 SESSION_NOT_FOUND`, never `403` (Principio II).

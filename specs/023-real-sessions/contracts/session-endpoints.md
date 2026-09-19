# Endpoints: Sesiones y dispositivos reales

All new/changed routes live in the existing `AuthController` Facade (`session` has no
`presentation/` layer of its own — see research.md R3/R10). All guarded ones use
`JwtAuthGuard`.

## `GET /auth/sessions`

Guarded. Lists the caller's own active sessions, newest activity first. Each row marks
`isCurrent` by comparing against the `sid` claim of the access token used for this
request.

**Response**: `auth.ListSessionsResponse` (see data-model.md).

## `DELETE /auth/sessions/:id`

Guarded. Path param validated via `rowId` (Principio VIII / `ZodParamsPipe`). Deletes
the session row if it belongs to the caller (404 `SESSION_NOT_FOUND` otherwise — never
403). If `:id` is the caller's OWN current session, this is a real logout: the client's
access token remains technically valid for its remaining lifetime bytes-wise, but
`JwtAuthGuard`'s per-request session check (research.md R2) rejects it on the very next
request either way.

**Response**: `204 No Content`.

## `POST /auth/sessions/revoke-others`

Guarded. Deletes every session row belonging to the caller EXCEPT the one tied to the
access token used for this request. A no-op (0 rows affected) if the caller has no other
sessions — never an error.

**Response**: `204 No Content`.

## `POST /auth/logout` (existing, extended)

No guard (unchanged — a logout must succeed even with an expired/missing access token,
same as today). Additionally reads the `refresh_token` cookie, and if it decodes to a
valid `sid`, deletes that session row before clearing cookies. Tolerant of a
missing/invalid/expired refresh token (still clears cookies and returns `204` either
way) — logging out must never fail client-side just because server-side cleanup
couldn't find anything to clean.

**Response**: `204 No Content` (unchanged).

## `POST /auth/refresh` (existing, extended)

Behavior unchanged from the caller's perspective. Internally: the `sid` from the
incoming refresh token now identifies which `Session` row to update (`lastUsedAt`,
`expiresAt`) instead of creating a new one — the new token pair reuses that same `sid`
(research.md R6). If the session row no longer exists (already closed by the user from
another tab, or purged as expired), the refresh is rejected exactly as an
invalid/expired refresh token is today (`InvalidRefreshTokenError`) — no new error code.

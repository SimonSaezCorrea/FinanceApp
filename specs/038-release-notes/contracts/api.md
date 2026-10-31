# API contract (038)

## `POST /api/v1/auth/me/release-notes/seen`

- Guard: `JwtAuthGuard`. Body: `auth.markReleaseNotesSeenRequestSchema` `{ releaseId: string }`
  (patrón de id de registro, ≤ 80). Respuesta: `204`.
- Efecto: `User.releaseNotesSeenId = max(actual, releaseId)`. Repetir o enviar uno más antiguo: 204 sin
  escribir. Sin sesión: 401. Id mal formado: 400 `VALIDATION_ERROR` (field `releaseId`).

## `GET /api/v1/auth/me`

- Gana `releaseNotesSeenId: string | null` (opcional en el contrato para convivir con un API anterior).

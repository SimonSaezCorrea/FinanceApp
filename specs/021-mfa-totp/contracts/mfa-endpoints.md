# Contratos: endpoints MFA

Todos bajo `/api/v1/auth`. Errores siempre `{error: {code, field?}}` (patrón existente del
proyecto) — ver `data-model.md` para la tabla completa código↔httpStatus.

## `POST /auth/login` (existente, comportamiento extendido)

Request: `{email, password}` — sin cambios.

Response `200`:
- Sin MFA: `{mfaRequired: false, user: CurrentUser}` + cookies `access_token`/`refresh_token`
  (igual que hoy).
- Con MFA activo: `{mfaRequired: true}` (sin `user`) + cookie `mfa_pending_token` (httpOnly, 5 min,
  firmada con `MFA_PENDING_TOKEN_SECRET`). NO se emiten `access_token`/`refresh_token`.

Errores: `INVALID_CREDENTIALS` (401), `ACCOUNT_DISABLED` (401) — sin cambios respecto de hoy.

## `POST /auth/login/mfa-verify` (nuevo, sin `JwtAuthGuard` — usa la cookie pendiente)

Request: `{code: string}` (`verifyMfaLoginSchema`).

Response `200`: `{user: CurrentUser}` + cookies `access_token`/`refresh_token` (idéntico al login
exitoso de hoy) + limpia la cookie `mfa_pending_token`.

Errores:
- `MFA_PENDING_TOKEN_INVALID` (401) — cookie ausente/expirada/inválida (el usuario debe volver a
  loguearse con email+contraseña).
- `MFA_LOCKED` (429) — `mfaLockedUntil` vigente. Cuerpo del error: la forma estándar
  `{error:{code,field?}}` del proyecto (`CLAUDE.md` §Errors), sin campos extra — no se agrega
  `retryAfterSeconds` ni ninguna otra propiedad informativa. El frontend deriva el mensaje
  ("Demasiados intentos, vuelve a intentarlo más tarde") del código `MFA_LOCKED` únicamente, igual
  que cualquier otro error de la app.
- `INVALID_MFA_CODE` (401) — código incorrecto, intentos < umbral (incrementa el contador).

## `POST /auth/me/mfa/enroll` (nuevo, guarded)

Request: sin body.

Response `200`: `startMfaEnrollmentResponseSchema` = `{qrCodeDataUrl, secret}`. Genera un secreto
TOTP nuevo, lo cifra y lo guarda en `mfaSecretEncrypted` (SIN activar — `mfaEnabled` no cambia).
Llamar de nuevo reemplaza el secreto pendiente (R10).

Errores: `MFA_ALREADY_ENABLED` (409) si `mfaEnabled === true` (hay que `disable` primero).

## `POST /auth/me/mfa/confirm` (nuevo, guarded)

Request: `confirmMfaEnrollmentSchema` = `{code: string}` (6 dígitos).

Response `200`: `confirmMfaEnrollmentResponseSchema` = `{recoveryCodes: string[]}` (10 códigos en
texto plano, primera y única vez que se muestran). Efecto: `mfaEnabled = true`, se crean las 10
filas `MfaRecoveryCode` (hasheadas).

Errores: `MFA_NOT_PENDING` (409) si no hubo `enroll` previo; `INVALID_MFA_CODE` (401) si el código
no valida contra el secreto pendiente; `MFA_ALREADY_ENABLED` (409) si ya estaba activa.

## `POST /auth/me/mfa/disable` (nuevo, guarded)

Request: `disableMfaSchema` = `{password: string}`.

Response `204`. Efecto: `mfaEnabled = false`, `mfaSecretEncrypted = null`,
`mfaFailedAttempts = 0`, `mfaLockedUntil = null`, se borran todas las `MfaRecoveryCode` del
usuario.

Errores: `INVALID_CURRENT_PASSWORD` (401) — misma semántica que ya usa "Eliminar cuenta".

## `GET /auth/me` (existente, response extendida)

`CurrentUser` gana `mfaEnabled` y `mfaRecoveryCodesRemaining` (ver data-model.md). Sin cambios de
request ni de status.

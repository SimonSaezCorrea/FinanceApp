# Contratos: endpoints de llave de acceso

Todos bajo `/api/v1/auth`. Errores siempre `{error: {code, field?}}`.

## `POST /auth/me/passkeys/register-options` (guarded)

Request: sin body.

Response `200`: `{options}` — opciones de `generateRegistrationOptions`, para pasar tal cual a
`navigator.credentials.create({publicKey: options})`. Efecto: emite/reemplaza la cookie de
desafío httpOnly (5 min) para este usuario.

## `POST /auth/me/passkeys/register-verify` (guarded)

Request: `{name: string, response}` (`response` = lo que devuelve
`navigator.credentials.create()`, serializado).

Response `201`: la `Passkey` creada (`{id, name, createdAt, lastUsedAt: null}`).

Errores: `PASSKEY_CHALLENGE_INVALID` (401) si la cookie falta/expiró; el propio
`@simplewebauthn/server` rechaza una `response` que no verifique contra el desafío/origen/rpId
esperados, mapeado también a `PASSKEY_CHALLENGE_INVALID`.

## `GET /auth/me/passkeys` (guarded)

Response `200`: `Passkey[]` (`{id, name, createdAt, lastUsedAt}[]`), ordenadas por `createdAt`
descendente.

## `DELETE /auth/me/passkeys/:id` (guarded)

Response `204`.

Errores: `PASSKEY_NOT_FOUND` (404) si no existe o no pertenece al usuario.

## `POST /auth/login/passkey-options` (público, sin guard)

Request: `{email: string}`.

Response `200`: `{options}` (opciones de `generateAuthenticationOptions`) — **siempre** la misma
forma, exista o no el email, tenga o no llaves (anti-enumeración, ver research.md R4).

## `POST /auth/login/passkey-verify` (público, sin guard)

Request: `{email: string, response}` (`response` = lo que devuelve
`navigator.credentials.get()`).

Response `200`: `{user: CurrentUser}` + cookies `access_token`/`refresh_token` (idéntico al login
exitoso con contraseña) — **nunca** pasa por `mfa_pending_token`, aunque el usuario tenga MFA
activo (FR-007).

Errores: `INVALID_CREDENTIALS` (401) — cualquier fallo (email sin llaves, firma inválida, contador
retrocedido, desafío expirado) responde exactamente este mismo código, nunca uno distinto por
tipo de fallo.

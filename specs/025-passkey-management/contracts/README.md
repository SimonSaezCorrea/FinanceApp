# Contracts: Renombrar passkeys y autocompletado condicional

## Endpoint nuevo

**`PATCH /auth/me/passkeys/:id`** (autenticado, `JwtAuthGuard`)

- Path param: `:id` — `passkeyIdParamsSchema` ya existente (`z.object({ id: rowId })`).
- Body: `renamePasskeyRequestSchema` nuevo — `{ name: string }` (1-60 caracteres tras recortar
  espacios).
- Response `200`: `auth.Passkey` (`{ id, name, createdAt, lastUsedAt }`, mismo shape que ya devuelve
  `POST .../register-verify`).
- Errores: `404 PASSKEY_NOT_FOUND` si el id no existe o no pertenece al usuario autenticado (mismo
  código que ya usa `DELETE /auth/me/passkeys/:id`); `400 VALIDATION_FAILED`/`INVALID_ID_FORMAT` por
  el pipe de validación estándar.

## Sin cambio en los endpoints de login

`POST /auth/login/passkey-options` y `POST /auth/login/passkey-verify` no cambian su forma — el
autocompletado condicional es 100% un cambio de CUÁNDO el frontend los llama, nunca de qué envían o
devuelven.

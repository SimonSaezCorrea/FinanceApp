# HTTP contract — Correos de cuenta y de seguridad (032)

Prefijo `/api/v1`. Errores con el formato de siempre: `{ error: { code, field? } }`. Esquemas zod en
`packages/contracts/src/auth/` (y `rowId` para todo id, Principio VIII).

## Sin sesión (sitio público)

### `POST /auth/email/verify`

Confirma una dirección con el token del enlace.

- Body: `{ token: string }` (base64url, 43 caracteres)
- `200 { verified: true }`
- `400 EMAIL_TOKEN_INVALID` — no existe, vencido, ya usado o reemplazado
- `409 EMAIL_TAKEN` — la dirección pendiente ya es el principal de otra cuenta
- Efecto: si era el `PRIMARY` sin confirmar → queda confirmado. Si era un `PENDING` → pasa a
  `PRIMARY` confirmado, el anterior a `PAST`, y se publica `EMAIL_CHANGED` (aviso a la dirección
  anterior si estaba confirmada).

### `POST /auth/password/forgot`

- Body: `{ identifierValue: string }` (RUT; se normaliza como en el login)
- **Siempre** `202 {}`, exista o no la cuenta (R9). El trabajo real ocurre después de responder.

### `POST /auth/password/reset`

- Body: `{ token: string, newPassword: string }` (`newPassword` con las mismas reglas que el registro)
- `200 {}`
- `400 EMAIL_TOKEN_INVALID`
- `400 VALIDATION` en `newPassword` (mismo formato que el resto de los formularios)
- Efecto (una transacción): nuevo hash, todas las sesiones cerradas, bloqueo de login en cero, token
  consumido; luego se publica `PASSWORD_RESET`. No crea sesión.

## Con sesión (`JwtAuthGuard`)

### `POST /auth/email/verification`

Reenvía el correo de verificación del pendiente, o del principal si no está confirmado.

- `202 {}`
- `409 EMAIL_ALREADY_VERIFIED` — no hay nada que confirmar
- `429 EMAIL_RATE_LIMITED`
- `503 EMAIL_UNAVAILABLE` — producción sin envío configurado

### `GET /auth/me/emails`

- `200 { items: UserEmail[] }`, principal primero, luego pendiente, luego historial (más reciente
  primero).
- `UserEmail = { id, address, status: "PRIMARY" | "PENDING" | "PAST", verifiedAt: string | null,
createdAt: string, replacedAt: string | null }`

### `POST /auth/me/emails`

Pide cambiar el correo: registra la dirección como pendiente y le envía el enlace.

- Body: `{ address: string }` (email válido)
- `201 { item: UserEmail }`
- `409 EMAIL_TAKEN` — ya es el principal de otra cuenta
- `409 EMAIL_ALREADY_PRIMARY` — es el principal actual
- `429 EMAIL_RATE_LIMITED`
- `503 EMAIL_UNAVAILABLE`

### `DELETE /auth/me/emails/:id`

- `:id` validado con `rowId`
- `204`
- `404 EMAIL_NOT_FOUND` — no existe o no es de la cuenta (ownership por `userId` en la consulta)
- `409 EMAIL_PRIMARY_NOT_DELETABLE`

## Cambios a endpoints existentes

- `GET /auth/me` (y toda respuesta que devuelve `CurrentUser`: login, registro, `PATCH /auth/me`) →
  `CurrentUser` gana `emailVerified: boolean` (el pendiente se lee de `GET /auth/me/emails`).
- `PATCH /auth/me` **deja de aceptar `email`**: cambiar el correo pasa por `POST /auth/me/emails`.
  Enviarlo responde `400 VALIDATION` (campo desconocido).
- `POST /auth/register` → además crea la fila `PRIMARY` y envía la verificación (sin cambiar su
  respuesta).
- Publican `AccountSecurityEvent` (sin cambiar su respuesta): cambio de contraseña, activar y
  desactivar el segundo factor, confirmar y eliminar una llave de acceso, eliminar la cuenta.

## Códigos nuevos (`errors.<CODE>` en es/en)

`EMAIL_TOKEN_INVALID`, `EMAIL_ALREADY_VERIFIED`, `EMAIL_ALREADY_PRIMARY`, `EMAIL_RATE_LIMITED`,
`EMAIL_UNAVAILABLE`, `EMAIL_NOT_FOUND`, `EMAIL_PRIMARY_NOT_DELETABLE` (`EMAIL_TAKEN` ya existe).

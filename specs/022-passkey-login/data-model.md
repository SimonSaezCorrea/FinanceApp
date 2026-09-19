# Data Model: Llave de acceso (Passkey / WebAuthn)

## `Passkey` (tabla nueva, `@@map("passkey")`, dominio `passkey`)

| Columna        | Tipo      | Notas |
|-----------------|-----------|-------|
| `id`            | String    | `@default(uuid(7))`, PK. |
| `userId`        | String    | FK → `User.id`, `onDelete: Cascade`. |
| `name`          | String    | Elegido por el usuario al registrar (ej. "MacBook de Ana"). |
| `credentialId`  | String    | `@unique` — identificador que entrega el autenticador (base64url). Identificador de **negocio**, nunca el PK (research.md R1, mismo tratamiento que el `code` de una institución). |
| `publicKey`     | String    | Clave pública del autenticador (base64url) — se necesita para verificar cada login futuro. |
| `counter`       | Int       | `@default(0)`. Se actualiza en cada login exitoso; un valor que retrocede indica clonado (research.md R6). |
| `transports`    | String[]  | `@default([])`. Pistas del autenticador (`usb`/`nfc`/`ble`/`internal`) — opcional, mejora la UX del navegador en logins futuros, no se valida. |
| `createdAt`     | DateTime  | `@default(now())`. |
| `lastUsedAt`    | DateTime? | `null` = nunca usada para iniciar sesión. Actualizada en cada login exitoso. |

Índices: `@@index([userId])` (listar/contar las llaves de un usuario).

**Ciclo de vida**: se crea una fila al confirmar un registro (`ConfirmPasskeyRegistrationHandler`).
Se borra individualmente (`RemovePasskeyHandler`, verifica ownership antes). No hay "desactivar sin
borrar" — eliminar es la única acción de gestión más allá de ver la lista (FR-010).

## Sin cambios en `User`

A diferencia de MFA (specs/021), esta feature no agrega columnas a `User` — no hay un flag
"passkeyEnabled" análogo a `mfaEnabled`, porque tener CERO filas `Passkey` ya es, por sí solo, "no
tiene llaves de acceso" (research.md R8).

## Nuevos errores de dominio (`apps/api/src/domains/user/domain/errors.ts`)

| Clase                       | `code`                 | `httpStatus` | Cuándo |
|-------------------------------|------------------------|--------------|--------|
| `PasskeyChallengeInvalidError` | `PASSKEY_CHALLENGE_INVALID` | 401     | La cookie de desafío falta, expiró, o no corresponde a la ceremonia (firma inválida). |
| `PasskeyNotFoundError`         | `PASSKEY_NOT_FOUND`    | 404          | `DELETE /auth/me/passkeys/:id` sobre una llave que no existe o no es del usuario. |

`InvalidCredentialsError` (ya existe, `INVALID_CREDENTIALS`, 401) se **reutiliza** para todo fallo
de `passkey-verify` (login) — nunca un código nuevo, por diseño anti-enumeración (research.md R4).

## Contrato (`packages/contracts/src/auth/index.ts`)

- `passkeySchema` (nuevo): `{id, name, createdAt, lastUsedAt}` — nunca expone `credentialId` ni
  `publicKey` en ninguna respuesta al cliente (son detalles de verificación, no de UI).
- `startPasskeyRegistrationResponseSchema`: `{options: unknown}` — el objeto de opciones que
  `@simplewebauthn/server` genera, reenviado tal cual a `navigator.credentials.create()` en el
  navegador (su forma exacta la fija el estándar WebAuthn, no este contrato).
- `confirmPasskeyRegistrationRequestSchema`: `{name: string, response: unknown}` — `response` es
  la respuesta cruda de `navigator.credentials.create()`, ya serializada a JSON por el helper del
  frontend (research.md R2).
- `startPasskeyLoginRequestSchema`: `{email: string}`.
- `startPasskeyLoginResponseSchema`: `{options: unknown}` — misma forma exista o no el email
  (anti-enumeración, R4).
- `verifyPasskeyLoginRequestSchema`: `{email: string, response: unknown}`.
- `listPasskeysResponseSchema`: `z.array(passkeySchema)`.

## Diagrama — ceremonia de registro (guarded, usuario ya logueado)

```text
POST /auth/me/passkeys/register-options ──▶ cookie de desafío (5 min) + opciones al navegador
        │
   navigator.credentials.create() en el navegador (usuario confirma con su dispositivo)
        │
POST /auth/me/passkeys/register-verify {name, response} ──▶ verifica contra la cookie ──▶ Passkey creada
```

## Diagrama — ceremonia de login (público, sin sesión)

```text
POST /auth/login/passkey-options {email} ──▶ SIEMPRE {challenge, allowCredentials, rpId}
        │                                     (allowCredentials vacío si el email no tiene llaves)
   navigator.credentials.get() en el navegador
        │
POST /auth/login/passkey-verify {email, response}
        │
        ├─ válida ──▶ sesión completa (mismas cookies que login con contraseña) — SIN pasar por MFA
        └─ inválida/vacía ──▶ InvalidCredentialsError (mismo código que contraseña incorrecta)
```

# Data Model: Verificación en dos pasos más completa (040)

Una migración Prisma (`<timestamp>_mfa_options`), **solo expansiva**: dos columnas en `user`, dos tablas
nuevas, dos enums nuevos. El código anterior sigue funcionando durante el despliegue.

## `user` (cambios)

| Campo              | Tipo         | Notas                                                                                                                  |
| ------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `mfaMethod`        | `MfaMethod?` | Método activo. Backfill `TOTP` donde `mfaEnabled = true`. Null = sin verificación (o fila previa: se lee como `TOTP`). |
| `mfaPendingMethod` | `MfaMethod?` | Método en configuración (activación o cambio), hasta confirmarlo.                                                      |

`mfaEnabled`, `mfaSecretEncrypted`, `mfaFailedAttempts`, `mfaLockedUntil` no cambian. Al pasar a `EMAIL`
el secreto TOTP se borra. El contador de intentos es uno solo para TOTP, correo y recuperación.

**Agregado `User`** (métodos nuevos/cambiados): `startMfaEnrollment(method, secret?)` (permite el cambio
con verificación activa; la regla de step-up la impone el handler), `confirmMfaEnrollment()` (activa o
cambia según `mfaPendingMethod`), `mfaMethodOrDefault()` (null con `mfaEnabled` → `TOTP`).

## `trusted-device` (nueva tabla-dominio, `domain/` + `infrastructure/`)

| Campo         | Tipo      | Notas                                                                                          |
| ------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `id`          | UUID v7   | PK (Principio VIII).                                                                           |
| `userId`      | FK `User` | `onDelete: Cascade`.                                                                           |
| `tokenHash`   | String    | SHA-256 del token de la cookie, `@unique`.                                                     |
| `deviceLabel` | String    | "Chrome · Windows", derivado una vez del User-Agent (mismo `device-info.ts` que las sesiones). |
| `createdAt`   | DateTime  | Cuándo se recordó.                                                                             |
| `expiresAt`   | DateTime  | `createdAt + 30 días`, fijo.                                                                   |
| `lastUsedAt`  | DateTime? | Último login que lo usó (informativo).                                                         |

Índice `(userId, createdAt)`. Reglas: máx. 10 por cuenta (el más antiguo sale); se borran todos al
cambiar/recuperar contraseña, desactivar la verificación, cambiar de método o regenerar códigos.

**Puerto `TrustedDeviceRepositoryPort`**: `rememberWithTx(tx, plan)` (inserta y poda a 10),
`findValidByTokenHash(tokenHash, now)`, `touch(id, now)`, `listForUser(userId, now)`,
`deleteOwned(userId, id)`, `deleteAllForUserWithTx(tx, userId)`, `purgeExpired(now)`.

## `mfa-code` (nueva tabla-dominio, `domain/` + `infrastructure/`)

| Campo       | Tipo             | Notas                                                       |
| ----------- | ---------------- | ----------------------------------------------------------- |
| `id`        | UUID v7          | PK. Parte del mensaje del HMAC.                             |
| `userId`    | FK `User`        | `onDelete: Cascade`.                                        |
| `purpose`   | `MfaCodePurpose` | `LOGIN` \| `ENROLL` \| `STEP_UP`.                           |
| `channel`   | `MfaCodeChannel` | `EMAIL` (enum preparado para `WHATSAPP`).                   |
| `codeHash`  | String           | `HMAC-SHA256(HKDF(MFA_ENCRYPTION_KEY), "<id>:<code>")`.     |
| `expiresAt` | DateTime         | `createdAt + 10 min`.                                       |
| `usedAt`    | DateTime?        | Usado, o reemplazado por uno más nuevo del mismo propósito. |
| `createdAt` | DateTime         |                                                             |

Índices: único parcial `(userId, purpose) WHERE "usedAt" IS NULL` (SQL a mano en la migración, como
`email-token`); `(userId, purpose, createdAt)` para los límites.

**Puerto `MfaCodeRepositoryPort`**: `issue(plan)` (su propia transacción: invalida el activo e inserta;
choque con el índice → `{ issued: false }`), `lastIssuedAt(userId, purpose)`,
`countSince(userId, purpose, since)`, `findActive(userId, purpose, now)`,
`consumeWithTx(tx, id, now)` (`UPDATE … WHERE id = ? AND usedAt IS NULL AND expiresAt > now`, devuelve
si ganó), `deleteAllForUserWithTx`, `purgeStale(before)`.

## Enums nuevos

- `MfaMethod`: `TOTP`, `EMAIL`.
- `MfaCodePurpose`: `LOGIN`, `ENROLL`, `STEP_UP`.
- `MfaCodeChannel`: `EMAIL`.

## Transiciones

```text
Sin verificación ──enroll(totp|email)──▶ pendiente ──confirm(código del método)──▶ activa(método)
activa(A) ──step-up + enroll(B)──▶ activa(A) + pendiente(B) ──confirm(código de B)──▶ activa(B)
                                                     (olvida dispositivos, conserva códigos de recuperación)
activa ──disable(contraseña)──▶ sin verificación (borra códigos, dispositivos, secreto)
```

# Data Model: MFA con TOTP

## `User` (columnas nuevas)

| Columna              | Tipo      | Default | Notas                                                                                                                                                                                      |
| -------------------- | --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mfaEnabled`         | Boolean   | `false` | Única fuente de verdad de "¿el login exige segundo paso?".                                                                                                                                 |
| `mfaSecretEncrypted` | String?   | `null`  | `iv:authTag:ciphertext` (hex), AES-256-GCM. Cifrado/descifrado SOLO en `PrismaUserRepository` (ver research.md R3). No-null + `mfaEnabled=false` = activación pendiente de confirmar (R9). |
| `mfaFailedAttempts`  | Int       | `0`     | Se resetea a 0 en cada código válido de `login/mfa-verify`.                                                                                                                                |
| `mfaLockedUntil`     | DateTime? | `null`  | Mientras `> now()`, todo intento se rechaza sin evaluar el código (R7).                                                                                                                    |

No se agrega columna de estado — derivado de `mfaSecretEncrypted`/`mfaEnabled` (R9).

## `MfaRecoveryCode` (tabla nueva, `@@map("mfa-recovery-code")`, dominio `mfa-recovery-code`)

| Columna     | Tipo      | Notas                                                                                      |
| ----------- | --------- | ------------------------------------------------------------------------------------------ |
| `id`        | String    | `@default(uuid(7))`, PK.                                                                   |
| `userId`    | String    | FK → `User.id`, `onDelete: Cascade`.                                                       |
| `codeHash`  | String    | bcrypt del código (formato `XXXX-XXXX`, ver research.md R4). Nunca se guarda texto plano.  |
| `usedAt`    | DateTime? | `null` = disponible. Set por un `UPDATE ... WHERE id = ? AND usedAt IS NULL` atómico (R5). |
| `createdAt` | DateTime  | `@default(now())`.                                                                         |

Índice: `@@index([userId])` (para el `COUNT WHERE usedAt IS NULL` de "cuántos quedan").

**Ciclo de vida**: se crean 10 filas al CONFIRMAR una activación (`confirm-mfa-enrollment`). Al
desactivar MFA (`disable-mfa`), se borran TODAS las filas del usuario (`deleteMany`) — reactivar
más adelante genera un set completamente nuevo, nunca reutiliza hashes viejos (cumple el requisito
explícito del spec de que códigos de una activación anterior no sirven tras reactivar).

## Nuevos errores de dominio (`apps/api/src/domains/user/domain/errors.ts`)

| Clase                         | `code`                      | `httpStatus` | Cuándo                                                                                                                                                                                                             |
| ----------------------------- | --------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MfaNotPendingError`          | `MFA_NOT_PENDING`           | 409          | `confirm-mfa-enrollment` sin un `enroll` previo (`mfaSecretEncrypted === null`).                                                                                                                                   |
| `InvalidMfaCodeError`         | `INVALID_MFA_CODE`          | 401          | Código TOTP/recuperación inválido, en `confirm` o en `login/mfa-verify`.                                                                                                                                           |
| `MfaLockedError`              | `MFA_LOCKED`                | 429          | `mfaLockedUntil > now()` (R7). **Amplía el union type de `DomainError.httpStatus`** de `400\|401\|404\|409` a incluir `429` — confirmado seguro en research.md R7 (el filtro global no tiene whitelist de status). |
| `MfaAlreadyEnabledError`      | `MFA_ALREADY_ENABLED`       | 409          | `enroll` o `confirm` cuando `mfaEnabled === true` — no hay "reemplazar dispositivo", hay que desactivar primero (regla explícita del spec, edge case documentado).                                                 |
| `MfaPendingTokenInvalidError` | `MFA_PENDING_TOKEN_INVALID` | 401          | Cookie `mfa_pending_token` ausente, expirada o con firma inválida en `login/mfa-verify`.                                                                                                                           |

`InvalidCurrentPasswordError` (ya existe, usado por cambio de contraseña) se reutiliza tal cual
para `disable-mfa` — mismo código `INVALID_CURRENT_PASSWORD` que ya usa "Eliminar cuenta".

## Contrato (`packages/contracts/src/auth/index.ts`)

- `CurrentUser` (schema existente) gana:
  - `mfaEnabled: boolean`
  - `mfaRecoveryCodesRemaining: number` (siempre `0` si `mfaEnabled === false`)
- `loginSchema` — sin cambios (sigue siendo `{email, password}`).
- `loginResponseSchema` (nuevo, reemplaza el shape ad-hoc de la respuesta de `POST /auth/login`):
  `{mfaRequired: true} | {mfaRequired: false, user: CurrentUser}` (discriminated union por
  `mfaRequired`; las cookies de sesión/pendiente viajan fuera del body, como ya ocurre).
- `startMfaEnrollmentResponseSchema` (nuevo): `{qrCodeDataUrl: string, secret: string}` — `secret`
  es el texto plano base32 SOLO en esta respuesta (alternativa manual al QR, pedida explícitamente
  en el spec), nunca más se vuelve a exponer.
- `confirmMfaEnrollmentSchema` (nuevo, request): `{code: string}` (6 dígitos).
- `confirmMfaEnrollmentResponseSchema` (nuevo): `{recoveryCodes: string[]}` (10 códigos en texto
  plano, SOLO en esta respuesta — nunca más se vuelven a exponer, ni siquiera parcialmente).
- `disableMfaSchema` (nuevo, request): `{password: string}`.
- `verifyMfaLoginSchema` (nuevo, request): `{code: string}` — un solo campo, acepta tanto un TOTP de
  6 dígitos como un código de recuperación `XXXX-XXXX`; el backend prueba ambos formatos (spec: "un
  único campo que detecta el formato").

## Diagrama de estados — MFA por usuario

```text
INACTIVA  ──enroll──▶  PENDIENTE  ──confirm (código válido)──▶  ACTIVA
   ▲                       │                                      │
   │                  confirm (código inválido): sin cambio       │
   │                  enroll de nuevo: reemplaza secreto pendiente │
   └──────────────── disable (password válida) ─────────────────┘
```

## Diagrama de estados — login con MFA activo

```text
email+password OK, mfaEnabled=false ──▶ sesión completa (sin cambios respecto de hoy)

email+password OK, mfaEnabled=true  ──▶ PENDIENTE_2FA (cookie mfa_pending_token, 5 min)
   │
   ├─ code válido (TOTP o recuperación sin usar) ──▶ sesión completa, mfaFailedAttempts→0
   ├─ code inválido, intentos < 5 ──▶ PENDIENTE_2FA, mfaFailedAttempts++
   └─ code inválido, intentos = 5 ──▶ BLOQUEADA 15min (mfaLockedUntil), 429 en todo intento posterior
```

# Data model — Correos de cuenta y de seguridad (032)

Dos tablas nuevas (una por dominio-tabla) y un cambio de uso en `user`. Todos los ids son UUID v7
(Principio VIII). Las restricciones que Prisma no expresa (índices parciales) van en el SQL de la
migración.

## `user-email` (dominio `user-email`) — registro de correos de una cuenta

| Campo        | Tipo                   | Notas                                                   |
| ------------ | ---------------------- | ------------------------------------------------------- |
| `id`         | UUID v7                | PK                                                      |
| `userId`     | UUID v7                | FK → `user`, `onDelete: Cascade`                        |
| `address`    | text                   | Normalizado: recortado y en minúsculas                  |
| `status`     | enum `UserEmailStatus` | `PRIMARY` · `PENDING` · `PAST`                          |
| `verifiedAt` | timestamptz, null      | Cuándo se confirmó esa dirección (null = sin confirmar) |
| `createdAt`  | timestamptz            | Cuándo se agregó al registro                            |
| `replacedAt` | timestamptz, null      | Cuándo dejó de ser `PRIMARY` o de estar `PENDING`       |

Restricciones e índices:

- `CREATE UNIQUE INDEX ... ON "user-email" ("userId") WHERE status = 'PRIMARY'` — exactamente un
  principal por cuenta (la existencia la garantizan el registro y la migración de datos).
- `CREATE UNIQUE INDEX ... ON "user-email" ("userId") WHERE status = 'PENDING'` — a lo sumo un
  pendiente.
- `@@index([userId])`, `@@index([address])`.
- La unicidad del principal **entre cuentas** la sigue dando `user.email @unique` (R5).

Transiciones (una sola transacción en cada caso, junto con los espejos de `user`):

```
(registro)          → PRIMARY (sin confirmar)
PRIMARY sin confirmar --verificar--> PRIMARY confirmado
(pedir cambio)      → PENDING            (un PENDING previo pasa a PAST)
PENDING --verificar--> PRIMARY confirmado (el PRIMARY anterior pasa a PAST, replacedAt = ahora)
PAST | PENDING --borrar--> (fila eliminada)   PRIMARY no se puede borrar
```

## `email-token` (dominio `email-token`) — enlaces de un solo uso

| Campo         | Tipo                     | Notas                                                                                     |
| ------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| `id`          | UUID v7                  | PK; también es la `Idempotency-Key` del envío a Resend                                    |
| `userId`      | UUID v7                  | FK → `user`, `onDelete: Cascade`                                                          |
| `purpose`     | enum `EmailTokenPurpose` | `VERIFY_EMAIL` · `RESET_PASSWORD`                                                         |
| `userEmailId` | UUID v7, null            | FK → `user-email`, `onDelete: Cascade`. Solo en `VERIFY_EMAIL`: la dirección que confirma |
| `tokenHash`   | text `@unique`           | SHA-256 (hex) del token del enlace; el token en claro nunca se guarda                     |
| `expiresAt`   | timestamptz              | `VERIFY_EMAIL`: +48 h · `RESET_PASSWORD`: +30 min                                         |
| `usedAt`      | timestamptz, null        | Consumido o reemplazado                                                                   |
| `createdAt`   | timestamptz              | Para la ventana de 60 s y el límite por hora                                              |

Índices:

- `@@index([userId, purpose, createdAt])`.
- `CREATE UNIQUE INDEX ... ON "email-token" ("userId", purpose) WHERE "usedAt" IS NULL` — **a lo más
  un enlace vigente por cuenta y propósito, impuesto por la base** (Principio VII forma b). Un enlace
  vencido sin usar sigue contando hasta que lo marque una emisión nueva o la limpieza.

Reglas:

- Consumir: `UPDATE ... SET usedAt = now() WHERE tokenHash = $1 AND usedAt IS NULL AND expiresAt >
now() RETURNING *`. Sin fila → `EMAIL_TOKEN_INVALID`.
- Emitir un token nuevo de un propósito es, en una transacción: marcar `usedAt` en el vigente del
  mismo propósito y cuenta, e insertar el nuevo. Una emisión concurrente choca con el índice parcial
  (`P2002`) y se trata como "ya enviado", sin mandar otro correo.
- Un `VERIFY_EMAIL` cuyo `user-email` ya no es `PENDING` ni `PRIMARY` sin confirmar se rechaza al
  consumirse; si esa fila se borra, el token se va con ella (cascade).
- Límite: a lo sumo 5 filas por (`userId`, `purpose`) con `createdAt` en la última hora.
- Limpieza: `MaintenanceCron` borra los tokens vencidos o usados hace más de 7 días (paso nuevo,
  aislado como los demás).

## `user` (cambios)

| Campo           | Cambio                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `email`         | Sin cambio de tipo: **espejo** de la dirección `PRIMARY`; se actualiza en la misma transacción |
| `emailVerified` | Columna heredada sin uso hasta hoy: pasa a ser **espejo** de `verifiedAt` del `PRIMARY`        |
| relaciones      | `emails UserEmail[]`, `emailTokens EmailToken[]`                                               |

`CurrentUser` (contrato) gana `emailVerified: boolean`; el pendiente se lee de `GET /auth/me/emails` (se descartó `pendingEmail` para no duplicar el registro).

## Migración

`apps/api/prisma/migrations/<fecha>_account_emails/migration.sql`:

1. Crear enums, tablas, FKs e índices (incluidos los dos índices parciales).
2. **Datos**: por cada `user` con `email` no nulo, insertar su fila `PRIMARY` **sin confirmar**
   (`verifiedAt` null, FR-013) y dejar `user.emailVerified` en null.

## Eliminación y anonimización (FR-012e)

- Borrado real de la cuenta: `user-email` y `email-token` se van por `onDelete: Cascade`.
- Anonimización (`keepHistory: true`): `DeleteAccountHandler` borra además todas las filas de
  `user-email` y `email-token` de la cuenta (`deleteAllForUserWithTx`, mismo trato que `session` y
  `passkey`), porque las direcciones identifican a la persona.

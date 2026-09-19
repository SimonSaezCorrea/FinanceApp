# Data Model: Sesiones y dispositivos reales

## `Session` (table `session`, domain-table `session`)

| Column        | Type                    | Notes                                                                                  |
| ------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `id`          | `String @default(uuid(7))` (PK) | UUID v7 — Principio VIII. **También es el claim `sid`** de los tokens de esa sesión. |
| `userId`      | `String` (FK → `User`, `onDelete: Cascade`) | Dueño de la sesión.                                                    |
| `deviceLabel` | `String?`                | Ej. `"Chrome · Windows"` — derivado del User-Agent al crear, nunca reparseado (R4).      |
| `country`     | `String?`                | Alpha-2 o nombre de país, resuelto por IP al crear (R5). `null` si no se pudo resolver.  |
| `createdAt`   | `DateTime @default(now())` | Cuándo se creó (el login que la originó).                                            |
| `lastUsedAt`  | `DateTime @default(now())` | Se actualiza en cada refresh exitoso que usa esta sesión (FR-009).                    |
| `expiresAt`   | `DateTime`                | `now() + JWT_REFRESH_EXPIRES` al crear; se recalcula igual en cada refresh (R6, R7).    |

Índices: `@@index([userId])` (listar por usuario), `@@index([expiresAt])` (el cron de
purga filtra por esta columna).

Sin `status`/flag de "cerrada" — **la fila existe si y solo si la sesión está activa**
(R8/FR-010): cerrarla es un DELETE real, no un soft-delete. No hay migración de datos
(dev-only, `db push`).

## JWT claims nuevos

- **Access token**: gana `sid` (antes solo `sub`+`email`). `JwtAuthGuard` lo usa para
  verificar que la sesión sigue existiendo, en la misma consulta que ya hace para
  `User.status` (R2).
- **Refresh token**: gana `sid` (antes solo `sub`). `RefreshTokenHandler` lo usa para
  saber qué fila `Session` actualizar en vez de crear una nueva (R6).

## Errores de dominio nuevos

- **`SESSION_NOT_FOUND`** (404) — `DELETE /auth/sessions/:id` sobre una sesión que no
  existe o no es del usuario (misma forma que cualquier lookup-by-id ajeno: 404, nunca
  403, Principio II).

No se reutiliza `InvalidRefreshTokenError`/`InvalidCredentialsError` para esto — cerrar
una sesión es una acción explícita sobre un recurso propio nombrado por id, no un intento
de autenticación, así que no aplica la misma lógica anti-enumeración que specs/021/022.

## Contrato (`packages/contracts/src/auth`)

```ts
export const sessionSchema = z.object({
  id: rowId,
  deviceLabel: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  isCurrent: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

export const listSessionsResponseSchema = z.array(sessionSchema);
export type ListSessionsResponse = z.infer<typeof listSessionsResponseSchema>;
```

`isCurrent` se calcula en el query handler comparando cada fila con el `sid` del access
token de la request que está pidiendo la lista (nunca se guarda en la fila misma — sería
verdadero para una sesión y falso para el resto de la MISMA fila según desde dónde se
consulte, así que no es un atributo de la sesión, es un atributo de la consulta).

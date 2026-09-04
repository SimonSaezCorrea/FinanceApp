# Data Model: Reintentos y doble envío no pueden duplicar dinero

**Feature**: 015-idempotent-money-writes · **Date**: 2026-09-02

Una tabla nueva, cero columnas nuevas en tablas existentes, cero migración de datos
(`pnpm db:push` + `pnpm db:seed`, como el resto del repo).

---

## 1. `IdempotencyRecord` (tabla `idempotency-record`) — NUEVA

Un intento del usuario: qué pidió, en qué estado quedó y qué le respondimos. Es la única tabla que
esta feature agrega, y es **dominio propio** (`src/domains/idempotency-record/`) porque el principio
VI exige una tabla ↔ un dominio ↔ un adapter.

| Campo            | Tipo                              | Notas                                                                                |
| ---------------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| `id`             | `String @id @default(cuid())`     | Igual que las otras 23 tablas. Ver la nota del principio VIII abajo                  |
| `userId`         | `String` → `User.id`, **Cascade** | Aislamiento por usuario (principio II): una clave siempre se busca junto al `userId` |
| `key`            | `String`                          | **La clave que genera el cliente.** Opaca para el servidor                           |
| `operation`      | `String`                          | Qué operación reservó la clave (`"transaction.create"`, `"debt.registerPayment"`, …) |
| `requestHash`    | `String`                          | SHA-256 del body canonicalizado. **Sólo** para detectar FR-005                       |
| `status`         | `IdempotencyStatus`               | `IN_FLIGHT` \| `COMPLETED`                                                           |
| `responseBody`   | `Json?`                           | El resultado exacto de la primera vez. `null` mientras `IN_FLIGHT`                   |
| `responseStatus` | `Int?`                            | El código HTTP de esa primera respuesta (201, 200, 204)                              |
| `createdAt`      | `DateTime @default(now())`        | También es el ancla del vencimiento de `IN_FLIGHT` (60 s)                            |
| `expiresAt`      | `DateTime`                        | `createdAt + 24 h`. Lo borra el cron                                                 |

**Restricciones**

```prisma
@@unique([userId, key])   // ← el candado: es lo que hace atómico el reserve (FR-006)
@@index([expiresAt])      // ← el barrido del cron
@@map("idempotency-record")
```

`@@unique([userId, key])` no es una validación: **es el mecanismo de exclusión mutua**. Dos
peticiones simultáneas hacen el mismo `INSERT`; Postgres deja pasar una y la otra recibe `P2002`.
No hace falta bloqueo pesimista ni fila previa que trabar.

La clave se scopea por `userId` y no globalmente por dos motivos: adivinar la clave de otro usuario
no alcanza para ver su respuesta (el principio VIII dice que un identificador no es autorización), y
dos usuarios que generen la misma clave no se pisan.

**Enum nuevo**

```prisma
enum IdempotencyStatus {
  IN_FLIGHT
  COMPLETED
}
```

No hay estado `FAILED`: un intento rechazado **se borra** (FR-004), no se recuerda. Recordarlo
dejaría al usuario trabado repitiendo el mismo error.

### Ciclo de vida

```
        INSERT (reserva)
             │
             ▼
        IN_FLIGHT ──── efecto + UPDATE en la MISMA transacción ────▶ COMPLETED ──▶ (cron a las 24 h)
             │                                                          │
             │  el efecto fue rechazado por una regla de negocio         │  un reintento
             ▼                                                          ▼  devuelve responseBody
          DELETE  (el usuario puede corregir y reintentar)         (sin efecto nuevo)
```

**Invariante que sostiene el diseño**: `IN_FLIGHT` ⟹ el efecto **no** está confirmado, salvo que su
transacción esté corriendo ahora mismo. De ahí que tomar un `IN_FLIGHT` de más de 60 s sea seguro y
no una apuesta. El argumento completo está en [research.md](./research.md) §3.

### Nota de conformidad con el principio VIII

`key` **no es un identificador de fila**: es un valor opaco provisto por el cliente, guardado en una
columna propia con su validación, exactamente como el principio describe a los identificadores de
negocio (código de institución, CBU). La PK de esta tabla es un `cuid()` igual que las otras 23. Esta
feature **no introduce un tercer formato de identificador** ni toca la deuda de conformidad 1 y 2.

---

## 2. `SavingsEntry` — sin cambios de schema, capacidades nuevas

La tabla `savings-entry` **no cambia**. Lo que falta es todo lo demás:

| Capa                                        | Hoy                                                                                                    | Después                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Puerto (`savings-entry.repository.port.ts`) | `list`, `create` — **y nada más**                                                                      | `+ findOne`, `+ save`, `+ remove`         |
| Agregado (`savings-entry.aggregate.ts`)     | `props` es `private readonly`, sin ningún método mutador; el docstring dice _"Immutable once created"_ | `+ applyUpdate(patch)`                    |
| Errores de dominio                          | el dominio **no tiene `errors.ts`**                                                                    | `+ SAVINGS_ENTRY_NOT_FOUND` (404)         |
| Comandos                                    | `create`                                                                                               | `+ update`, `+ remove`                    |
| Consultas                                   | `list`                                                                                                 | `+ get`                                   |
| Endpoints                                   | `GET /savings/entries`, `POST /savings/entries`                                                        | `+ GET/PATCH/DELETE /savings/entries/:id` |
| Contrato                                    | no existe `updateSavingsEntrySchema`                                                                   | `+ updateSavingsEntrySchema`              |

Los campos editables son los mismos que acepta `createSavingsEntrySchema`: `amount`, `currency`,
`contributedAt`, `savingsGoalId`, `note`.

**Lo que esta feature NO construye**: el progreso acumulado de la meta. Verificado — `SavingsGoal` no
tiene columna de monto acumulado, el agregado nunca lee sus aportes, el repositorio no hace `include`
ni `_sum`, y el contrato no expone progreso. La relación `entries` está declarada en Prisma y **no la
lee nadie**. Construir el progreso y su UI es una spec propia; acá sólo se abre el camino de
corrección, y FR-013 queda escrito como regla para las cifras que se deriven en el futuro.

---

## 3. `Debt` — sin cambios de schema, invariantes nuevas

La tabla no cambia. El agregado gana las guardas que le faltan
([research.md](./research.md) §9):

| Método          | Hoy                                                             | Después                                                                   |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `settle()`      | sin guarda: re-estampa `settledAt = new Date()` en cada llamada | lanza `DEBT_ALREADY_SETTLED` si ya estaba liquidada                       |
| `undoPayment()` | limpia `settledAt` siempre que no sea null                      | lo limpia **sólo** si el pago deshecho es el que había liquidado la deuda |
| `applyUpdate()` | 12 asignaciones sin validar                                     | rechaza dejar `totalInstallments < paidInstallments` (FR-014)             |

---

## 4. Puertos `*WithTx` que faltan

Consecuencia directa de que el handler pase a ser dueño de la transacción
([research.md](./research.md) §5). Ningún método existente cambia de firma: el actual se convierte en
una llamada a su variante con el cliente base, como ya hace
`prisma-installment-plan.repository.ts:107`.

| Puerto                            | Método nuevo                       | Reemplaza a                                                                         |
| --------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| `TransactionRepositoryPort`       | `saveNewWithTx(tx, …)`             | el `$transaction` interno de `saveNew` (`prisma-transaction.repository.ts:210-247`) |
| `TransactionRepositoryPort`       | `saveTransferPairWithTx(tx, …)`    | el de `saveTransferPair` (`:333-368`)                                               |
| `DebtRepositoryPort`              | `saveWithTx(tx, debt)`             | no existía transacción alguna                                                       |
| `SavingsEntryRepositoryPort`      | `createWithTx(tx, …)`              | no existía                                                                          |
| `IdempotencyRecordRepositoryPort` | `completeWithTx(tx, id, response)` | — es nuevo                                                                          |

**Puerto nuevo completo** (`idempotency-record/domain/ports/`):

| Método                                         | Para qué                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `reserve(userId, key, operation, requestHash)` | El `INSERT`. Devuelve la reserva, o el registro existente si chocó |
| `findByKey(userId, key)`                       | Leer el registro tras un choque                                    |
| `completeWithTx(tx, id, status, body)`         | El `UPDATE` que viaja **dentro** de la transacción del efecto      |
| `release(id)`                                  | El `DELETE` cuando el efecto fue rechazado (FR-004)                |
| `takeOver(id)`                                 | Reclamar un `IN_FLIGHT` vencido                                    |
| `deleteExpired(now)`                           | El barrido del cron                                                |

---

## 5. Códigos de error nuevos

Códigos agnósticos del idioma, como manda la convención; la prosa vive en `es.json`/`en.json`.

| Código                     | HTTP | Cuándo                                                                                                |
| -------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| `IDEMPOTENCY_KEY_REQUIRED` | 400  | Falta el header en una operación protegida                                                            |
| `IDEMPOTENCY_KEY_REUSED`   | 409  | Misma clave, distinto body u operación (FR-005) — 409 y no 422: `DomainError` restringe a 400/404/409 |
| `IDEMPOTENCY_IN_PROGRESS`  | 409  | El intento se está ejecutando ahora mismo (FR-006)                                                    |
| `SAVINGS_ENTRY_NOT_FOUND`  | 404  | Corregir un aporte inexistente o ajeno                                                                |
| `DEBT_ALREADY_SETTLED`     | 409  | **Ya existe** — pasa a lanzarse también desde `settle()`                                              |

---

## 6. Volumen y crecimiento

Un registro por operación protegida. Una app de finanzas personales genera del orden de decenas de
movimientos por usuario por mes, así que la tabla se mantiene en cientos de filas y el cron la
recorta a una ventana de 24 h. `responseBody` guarda un DTO de movimiento o de plan: cientos de
bytes, sin adjuntos ni listas largas.

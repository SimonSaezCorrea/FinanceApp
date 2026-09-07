# Data Model: Rediseño de Ahorros con progreso real y dinero real

**Feature**: 018-savings-redesign — sin migración formal (dev, `pnpm db:push` + `pnpm db:seed`
regenera), siguiendo la convención del resto del repo.

## Cambios de schema (`apps/api/prisma/schema.prisma`)

### `SavingsGoal` (existente, tabla `savings-goal`)

| Campo | Tipo | Nota |
| --- | --- | --- |
| `id, userId, title, targetAmount, currency, deadline, createdAt, updatedAt` | *(sin cambios)* | |
| `notes` | `String?` | **Nuevo.** Nota libre del formulario (README §3) — no existía ningún campo de nota en el modelo actual. |
| `closedAt` | `DateTime?` | **Nuevo.** `null` = meta abierta. |
| `closeDestination` | `SavingsGoalCloseDestination?` | **Nuevo enum.** `null` mientras la meta está abierta. |
| `closeAccountId` | `String?` | **Nuevo, plano (no FK).** Solo con destino `WITHDRAW_TO_ACCOUNT` — bookkeeping de reversión, mismo patrón que `Debt.lastPaymentAccountId`. |
| `closeTransactionId` | `String?` | **Nuevo, plano (no FK).** Solo con `WITHDRAW_TO_ACCOUNT` — el movimiento a revertir en "reabrir". |
| `closeAmount` | `Decimal? @db.Decimal(18,4)` | **Nuevo, plano.** Solo con `WITHDRAW_TO_ACCOUNT` — el monto exacto que se movió, para revertir aunque el total de la meta cambiara después. |
| `closeTargetGoalId` | `String?` | **Nuevo, plano (no FK).** Solo con `TRANSFER_TO_GOAL` — únicamente para mostrar "traspasado a «{meta}»"; si esa meta se borra después, se degrada (no rompe). |

```prisma
enum SavingsGoalCloseDestination {
  WITHDRAW_TO_ACCOUNT
  FREE_SAVINGS
  TRANSFER_TO_GOAL
}
```

**Invariantes del agregado** (`domain/savings-goal.aggregate.ts`):
- `close(destination, payload)` exige `closedAt === null` (si no, `SavingsGoalAlreadyClosedError`) y
  que el estado derivado sea "cumplida" o "vencida" — el agregado no conoce `pace`/`deadlineMonths`
  directamente (son derivados fuera del agregado, ver data-model de `savings-entry` abajo), así que
  esta condición se verifica en el **handler**, no en el aggregate, pasando el resultado ya calculado
  (mismo patrón que otros agregados reciben hechos pre-computados en vez de recalcularlos ellos
  mismos). El agregado sí exige que el body coincida con el destino (`accountId` solo para
  `WITHDRAW_TO_ACCOUNT`, `targetGoalId` solo para `TRANSFER_TO_GOAL`).
- `reopen()` exige `closedAt !== null` (si no, `SavingsGoalNotClosedError`); limpia `closedAt` +
  `closeDestination` + los 4 campos de bookkeeping, y devuelve `{ accountId, transactionId, amount }
  | null` para que el handler revierta el movimiento real solo cuando corresponde (análogo a
  `Debt.undoPayment()`/`takePaymentRecord()`).
- Cambiar `currency` se rechaza (`SavingsGoalCurrencyLockedError`, 409) si la meta ya tiene al menos
  un aporte — el handler lo verifica antes de llamar `applyUpdate` (necesita contar entries, algo que
  el agregado de `SavingsGoal` no conoce por sí solo; ver `savings-entry`'s puerto de conteo abajo).

### `SavingsEntry` (existente, tabla `savings-entry`)

| Campo | Tipo | Nota |
| --- | --- | --- |
| `id, userId, savingsGoalId, amount, currency, contributedAt, note, createdAt` | *(sin cambios)* | |
| `bankAccountId` | `String?` | **Nuevo.** FK → `BankAccount`, `onDelete: SetNull` — la cuenta real de origen. Nullable a nivel de schema (para sobrevivir el borrado de la cuenta), pero SIEMPRE se exige al crear (ver contrato). |
| `transactionId` | `String?` | **Nuevo, plano (no FK).** El `Transaction.id` real que este aporte generó — lo que editar/eliminar el aporte usa para revertir/ajustar, sin tener que hacer una query inversa. |

**Invariantes del agregado** (`domain/savings-entry.aggregate.ts`):
- `assertEditable()`/`assertDeletable()` (nuevos) lanzan `SavingsEntryGoalClosedError` (409) si
  `savingsGoalId` apunta a una meta cuyo `closedAt !== null` — el handler resuelve la meta (ya la
  necesita para otras validaciones) y se lo pasa al agregado, igual que el patrón de
  `InstallmentPlan.applyUpdate`/`assertDeletable` freezing.
- Un aporte de ahorro libre (`savingsGoalId === null`) nunca tiene meta que congelar → siempre
  editable/eliminable.

### `Transaction` (existente)

| Campo | Tipo | Nota |
| --- | --- | --- |
| `savingsEntryId` | `String? @unique` | **Nuevo.** FK → `SavingsEntry`, `onDelete: SetNull` — el EXPENSE real de un aporte (relación 1:1). |
| `savingsGoalId` | `String?` | **Nuevo.** FK → `SavingsGoal`, `onDelete: SetNull` — el INCOME real de un cierre "retirar a cuenta" (no único: la meta puede cerrarse/reabrirse varias veces en momentos distintos). |

`packages/contracts/src/transactions/index.ts`'s `transactions.sourceOf()` gana dos casos nuevos,
mutuamente excluyentes con los existentes (mismo orden de prioridad que ya tiene: transfer → cuota →
cargo financiero → deuda → ahora ahorro → manual):

```ts
// nuevo, antes del fallback "MANUAL"
if (t.savingsEntryId) return { kind: "SAVINGS" };
if (t.savingsGoalId) return { kind: "SAVINGS_WITHDRAWAL" };
```

## Entidades derivadas (no persistidas)

Expuestas en el DTO de `SavingsGoal` que devuelven `GET /savings/goals` y `GET /savings/goals/:id`,
calculadas en el query handler (mismo patrón que `Card.ownUsed`/`BankAccount.creditPools`):

| Campo derivado | Fórmula | Fuente |
| --- | --- | --- |
| `savedAmount` | Σ `amount` de todos los aportes de la meta (abierta o cerrada) | `SavingsEntryRepositoryPort` (nuevo método de agregación) |
| `pace` | Promedio de aportes de los últimos 3 meses calendario completos (o desde `createdAt` si es más nueva, mínimo 1 mes); `"0"` sin aportes | idem |

`GET /savings/summary` (nuevo, ver `contracts/savings.md`) agrega across todas las metas + ahorro
libre del usuario — mismo rol que `GET /transactions/summary`.

## Puertos nuevos/extendidos

- **`SavingsEntryRepositoryPort`**: + `sumsByGoal(userId): Map<goalId, { total, last3Months }>` (o
  equivalente para computar `savedAmount`/`pace` en batch, evitando N+1 al listar metas); +
  `saveWithTx`/`removeWithTx` (hoy solo existe `createWithTx`); + `reassignGoalWithTx(tx, fromGoalId,
toGoalId: string | null)` — el `UPDATE … SET savingsGoalId = ?` masivo que usa cerrar-con-destino
  "ahorro libre"/"traspaso".
- **`SavingsGoalRepositoryPort`**: + `saveWithTx`, `findOneForUpdateWithTx` (mismo shape que
  `DebtRepositoryPort`); + `countEntries(goalId): number` (para la regla de moneda fija).
- **`BankAccountRepositoryPort`**: sin cambios de forma — se reutiliza `incrementBalanceWithTx` tal
  cual.
- **`TransactionWriterRepositoryPort`**: `TransactionPlan` gana `savingsEntryId?: string | null` y
  `savingsGoalId?: string | null` (mismo patrón que `debtId`/`installmentPlanId`).

## Errores nuevos (`domain/errors.ts` de `savings-goal`/`savings-entry`)

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `SAVINGS_GOAL_NOT_CLOSEABLE` | 409 | Cerrar una meta que no está cumplida ni vencida |
| `SAVINGS_GOAL_ALREADY_CLOSED` | 409 | Cerrar una meta ya cerrada |
| `SAVINGS_GOAL_NOT_CLOSED` | 409 | Reabrir una meta que no está cerrada |
| `SAVINGS_GOAL_CURRENCY_LOCKED` | 409 | Cambiar la moneda de una meta con al menos un aporte |
| `SAVINGS_GOAL_CLOSED` | 409 | Registrar/editar/eliminar un aporte de una meta actualmente cerrada |
| `SAVINGS_GOAL_TARGET_NOT_OPEN` | 409 | "Traspasar a otra meta" hacia una meta cerrada o la misma que se cierra |
| `SAVINGS_GOAL_TARGET_CURRENCY_MISMATCH` | 409 | Meta de destino del traspaso con otra moneda |
| `SAVINGS_ENTRY_CURRENCY_MISMATCH` | 409 | La cuenta de origen o la meta no comparten moneda con el aporte |
| `SAVINGS_ENTRY_FROM_CREDIT_ACCOUNT` | 409 | Cuenta de origen/destino de tipo `CREDIT_LINE` |

`SAVINGS_GOAL_NOT_FOUND`/`SAVINGS_ENTRY_NOT_FOUND` (404, existentes) cubren "no existe o no es del
usuario" — nunca 403, sin cambios.

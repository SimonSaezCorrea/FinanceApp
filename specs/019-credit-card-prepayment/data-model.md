# Data Model: Prepago de tarjeta de crédito (período abierto)

## `CreditStatement` (existente — cambios)

| Campo           | Tipo                         | Cambio                                                                                                                                                                                           |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prepaidAmount` | `Decimal(18,4)`, default `0` | **Nuevo.** Acumulado de todos los prepagos aplicados a este período. Nunca negativo; nunca mayor que `grossTotal` (linked + carriedOver + instalment) en el momento en que cada abono se aplicó. |

**`CreditStatementRepositoryPort` — método nuevo (hallazgo de `/speckit-analyze`, ver `research.md` R8):**

- `findByIdForUpdateWithTx(tx: unknown, userId: string, accountId: string, statementId: string): Promise<CreditStatement | null>` — lee y BLOQUEA la fila (`SELECT ... FOR UPDATE`, mismo mecanismo que `debt.repository.port.ts`'s `findOneForUpdateWithTx`). Usado por `PrepayOpenPeriodHandler` y por la ruta de reversión (`UpdateTransactionHandler`/`RemoveTransactionHandler` cuando el movimiento tiene `prepaymentStatementId`) para que el ciclo leer→validar→escribir del período ocurra dentro de una sola transacción, cerrando la carrera de concurrencia donde dos abonos con distinta `Idempotency-Key` podrían, ambos, validar contra el mismo remanente y juntos exceder lo debido.

**Métodos del agregado (`credit-statement.aggregate.ts`):**

- `totalFor(linkedAmount, instalmentAmount = "0")` — **cambia**: ahora resta `prepaidAmount` del resultado (`linked + carriedOver + instalment - prepaidAmount`, nunca negativo). Todo llamador existente (pay, sync, mapper) se beneficia sin cambios propios.
- `changePrepayment(grossTotal: string, oldContribution: string, newContribution: string): void` — **nuevo**. Ajusta `prepaidAmount` en `newContribution - oldContribution`. Valida `newContribution >= 0` y `prepaidAmount` resultante `<= grossTotal` (si no, `PaymentExceedsRemainingError`, reutilizado). Tres usos:
  - Crear: `oldContribution = "0"`.
  - Editar: `oldContribution = montoAnterior`.
  - Eliminar: `newContribution = "0"`.
- La creación de un prepago (`oldContribution = "0"`) además exige `this.state.canPrepay()` — ver `CreditStatementState` abajo. Editar/eliminar uno existente NO tiene ese gate (debe funcionar aunque el período ya haya cerrado — FR-013).

**`CreditStatementState` (interfaz, `domain/states/credit-statement-state.ts`) — cambio:**

- Nuevo método `canPrepay(): boolean`.
  - `OpenState` → `true`.
  - `PendingState`, `PartiallyPaidState`, `PaidState` → `false` (una vez cerrado, la única vía para abonar es pagar la facturación).

## `Transaction` (existente — cambios)

| Campo                   | Tipo                                                    | Cambio                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepaymentStatementId` | `String?` (FK → `CreditStatement`, `onDelete: SetNull`) | **Nuevo.** El período al que este movimiento abonó. `null` para cualquier otro movimiento. Sin `@unique` — un período admite muchos prepagos (a diferencia de `CreditStatement.paidTransactionId`, que es 1:1).                                                                                                   |
| `prepaymentAccountId`   | `String?` (plano, no FK)                                | **Nuevo.** La cuenta CREDIT_CARD que recibió el abono — denormalizado al crear (igual que ya se hace con otros campos de solo-lectura para evitar un join en cada lectura), para que el detalle del movimiento pueda enlazar directo a `/accounts/:id?tab=billing&statement=:id` sin resolverlo en cada consulta. |

Un movimiento de prepago es, por lo demás, un `EXPENSE` ordinario: `bankAccountId` = la cuenta de origen (con saldo real), `cardId = null`, `creditStatementId = null` (no es un consumo de la tarjeta, así que nunca debe sumar en `netForStatement`/`netForPeriod`), `financeCharge = false`, `installmentPlanId = null`, `debtId = null`.

## Contrato (`@finance/contracts`)

### `transactions.transactionSchema` — dos campos nuevos

```ts
prepaymentStatementId: rowId.nullable(),
prepaymentAccountId: rowId.nullable(),
```

### `transactions.sourceOf()` — un caso nuevo

```ts
export type TransactionSource =
  | ...
  | { kind: "CREDIT_CARD_PREPAYMENT"; statementId: string; accountId: string }
  | { kind: "MANUAL" };
```

Comprobado ANTES de `STATEMENT_PAYMENT` (aunque nunca colisionan, mantiene el orden temático: "abonos hacia una tarjeta" agrupados).

### `accounts.CreditStatement` — un campo nuevo

```ts
prepaidAmount: moneyString,
```

Expuesto junto a `paidAmount`/`carriedOverAmount` — mismo tratamiento (siempre una cadena de dinero, nunca null).

### Nuevo endpoint / comando

`POST /accounts/:id/credit-statements/:statementId/prepay`

- Requiere `Idempotency-Key` (constitución, Principio VII, forma (c) — mismo mecanismo que `.../pay`).
- Body: `prepayCreditStatementSchema` = `{ fromAccountId: rowId, amount: moneyString, paidAt?: isoDateString }` (sin `reference` opcional a diferencia de `pay` — no hay decisión de producto pendiente sobre esto; puede añadirse igual que `pay` en implementación si se decide reutilizar el mismo campo).
- Respuesta: `accounts.CreditStatement` (el período actualizado, igual que `pay`/`sync`).
- Errores nuevos: reutiliza `PAYMENT_EXCEEDS_REMAINING`, `INVALID_PAYMENT_AMOUNT` (ya existen); nuevo **`STATEMENT_NOT_OPEN`** (crear un prepago contra algo que no es el período OPEN — defensa en profundidad, la UI no debería permitirlo nunca).

## Estados y transiciones

Sin cambios en el enum `status` (`OPEN | PENDING | PARTIALLY_PAID | PAID`) — un prepago **no** mueve al período de estado. Solo cambia lo que `amount`/`remainingAmount` reportan mientras el período sigue vivo.

```
OPEN --(prepago)--> OPEN         (prepaidAmount sube, no cambia de estado)
OPEN --(cierre normal)--> PENDING  (totalFor ya neto de todos los prepagos hechos)
PENDING --(pagar el resto)--> PAID | PARTIALLY_PAID   (sin cambios de esta feature)
```

## Reglas de validación (resumen)

| Regla                                                                   | Dónde se aplica                                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Monto > 0                                                               | `CreditStatement.changePrepayment` (vía `InvalidPaymentAmountError`, reutilizado)               |
| Monto acumulado ≤ deuda bruta del período                               | `CreditStatement.changePrepayment` (vía `PaymentExceedsRemainingError`, reutilizado)            |
| Solo se puede CREAR un prepago si el período está OPEN                  | `CreditStatementState.canPrepay()` — `StatementNotOpenError` (nuevo) si no                      |
| La cuenta de origen no puede ser CREDIT_CARD ni la misma cuenta destino | Mismo chequeo que ya usa `PayCreditStatementHandler` (`InvalidPaymentSourceError`, reutilizado) |
| Editar/eliminar un prepago funciona aunque el período ya haya cerrado   | `UpdateTransactionHandler`/`RemoveTransactionHandler`, sin gate de estado                       |

# Data model — 028

Sin tablas nuevas. Cambios en `credit-statement`, `transaction` y en el catálogo `category`.
Identificadores: todos UUID v7 (Principio VIII), sin cambios de formato.

## CreditStatement (tabla `credit-statement`)

| Campo                     | Tipo                        | Nuevo | Regla                                                                                                                                                                                                                                                         |
| ------------------------- | --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currency`                | String(3) `@default("CLP")` | ✔     | Moneda del período. El default solo sirve para agregar la columna a filas existentes (todas CLP); todo período nuevo se crea con su moneda explícita. Máx. un período abierto por `(accountId, currency)`. Índice `@@index([accountId, currency, closedAt])`. |
| `transferredAt`           | DateTime?                   | ✔     | Fecha del traspaso. `!= null` ⇒ estado `TRANSFERRED` (terminal). Excluyente con `paidAt` como origen de la liquidación final.                                                                                                                                 |
| `transferredAmount`       | Decimal(18,4)?              | ✔     | Monto en la moneda de la CUENTA que cargó el banco.                                                                                                                                                                                                           |
| `transferTransactionId`   | String? `@unique`           | ✔     | El GASTO en pesos (cargo del emisor) creado por el traspaso.                                                                                                                                                                                                  |
| `settlementTransactionId` | String? `@unique`           | ✔     | El INGRESO de liquidación en la moneda del período (pago en otra moneda o traspaso).                                                                                                                                                                          |
| `transferredToId`         | String?                     | ✔     | Período en la moneda de la cuenta que recibió el cargo (para el enlace y para R9).                                                                                                                                                                            |
| resto                     | —                           | —     | Sin cambios (`paidAmount`, `carriedOverAmount`, `prepaidAmount`, …).                                                                                                                                                                                          |

**Estado derivado** (`CreditStatement.state`):

```
transferredAt != null                 → TRANSFERRED   (terminal)
paidAt != null && paidAmount < amount → PARTIALLY_PAID (terminal)
paidAt != null                        → PAID          (terminal)
closedAt != null                      → PENDING
otherwise                             → OPEN
```

Un pago parcial liquida su período (PARTIALLY_PAID, terminal) y arrastra el faltante al sucesor de
la misma moneda: el traspaso siempre actúa sobre el período que tiene la deuda viva —ese sucesor,
una vez cerrado y vencido—, nunca sobre uno ya liquidado. Por eso un período traspasado tiene
`paidAt` null y `paidAmount` "0".

**Métodos nuevos del agregado**:

- `transferTowards(periodAmount, transferredAmount, settlementTxId, transferTxId, toStatementId,
when)` → `{ settled }`: exige `state.canTransfer()` (solo PENDING), `transferredAmount > 0`;
  congela `amount = periodAmount`, `settled = remainingFor(periodAmount)`.
- `transferReversal()` → `{ restoredAmount, restoredCurrency, removedAmount, removedCurrency,
receivingStatementId, settlementTransactionId, transferTransactionId }`: puro, solo desde campos
  guardados; exige `TRANSFERRED`. Es lo que el DTO expone para la confirmación Y lo que
  `UndoTransferStatementHandler` aplica (Principio I).
- `undoTransfer()` → aplica `transferReversal()` al propio período (limpia los cinco campos de
  traspaso y descongela `amount`) y la devuelve para que el handler revierta lo demás.
- `payTowards(...)` gana `settlementTransactionId?` (se guarda cuando la facturación es de otra
  moneda).

## Transaction (tabla `transaction`)

| Campo                | Tipo                                                           | Nuevo | Regla                                                                                                                                 |
| -------------------- | -------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `settlesStatementId` | String? FK → `CreditStatement`, `onDelete: SetNull`, `@@index` | ✔     | Movimiento de liquidación (R3/R4). Nunca enlazado a un período; excluido de `netForPeriod` y `relinkToStatementWithTx`; solo lectura. |

`transactions.sourceOf` gana `STATEMENT_SETTLEMENT` (tiene `settlesStatementId`) y
`CURRENCY_TRANSFER` (es el `transferTransactionId` de un período — resuelto como hoy
`STATEMENT_PAYMENT`, vía `CreditStatementLookupPort`, campos de contrato `transferStatementId` /
`transferStatementAccountId`), evaluados antes que `FINANCE_CHARGE`.

## Category (seed)

Nueva fila de sistema `CURRENCY_TRANSFER` (kind EXPENSE, `isSystem: true`), labels es/en
"Traspaso de moneda" / "Currency transfer". Asignada por el servidor al cargo en pesos del traspaso.

## CardLimit

Sin cambios de esquema. Regla nueva (R12): no se puede eliminar el de una moneda con deuda.

## Invariantes

1. Un solo período OPEN por `(accountId, currency)`.
2. Todos los períodos OPEN de una cuenta comparten `periodStart` (R2) y cierran el mismo día.
3. Un movimiento de otra moneda en una cuenta de crédito, que no sea de liquidación, pertenece al
   período de su moneda.
4. El cupo persistido (`creditUsed`) solo se mueve con importes en la moneda de la cuenta.
5. Uso del tope en otra moneda = inicial + Σgasto − Σingreso de sus movimientos con la tarjeta,
   incluidas las liquidaciones.

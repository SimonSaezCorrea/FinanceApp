# Contract: Prepagar el período abierto de una tarjeta de crédito

## `POST /api/v1/accounts/:id/credit-statements/:statementId/prepay`

Declarado en `CreditStatementsController`, junto a `pay`/`sync`/`payment` (mismo patrón de rutas literales bajo `:id/credit-statements/:statementId/...`).

### Headers

| Header | Requerido | Nota |
| --- | --- | --- |
| `Idempotency-Key` | Sí | Igual que `.../pay` — `IDEMPOTENCY_KEY_REQUIRED` (400) si falta. |

### Path params

| Param | Tipo | Nota |
| --- | --- | --- |
| `id` | `rowId` | La cuenta CREDIT_CARD que recibe el abono. |
| `statementId` | `rowId` | Debe ser el período actualmente OPEN de esa cuenta. |

### Body — `accounts.prepayCreditStatementSchema`

```ts
{
  fromAccountId: rowId,   // cuenta de origen, con saldo real
  amount: moneyString,    // > 0
  paidAt?: isoDateString, // fecha del movimiento; default = ahora
}
```

### Respuesta — `200 OK`

`accounts.CreditStatement` (el período OPEN actualizado — `prepaidAmount` subido, `amount`/`remainingAmount` ya netos del nuevo abono).

### Errores

| Código | Causa |
| --- | --- |
| `ACCOUNT_NOT_FOUND` | `id` o `fromAccountId` no existen / no son del usuario. |
| `STATEMENT_NOT_FOUND` | `statementId` no existe en esa cuenta. |
| `STATEMENT_NOT_OPEN` | **Nuevo.** `statementId` no es el período actualmente OPEN (ya cerró, o pertenece a otro). |
| `INVALID_PAYMENT_SOURCE` | `fromAccountId` es una cuenta CREDIT_CARD, o es la misma que `id`. |
| `INVALID_PAYMENT_AMOUNT` | `amount` ≤ 0. |
| `PAYMENT_EXCEEDS_REMAINING` | `amount` (sumado a lo ya prepagado) supera lo que el período debe hoy. |
| `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_REUSED` / `IDEMPOTENCY_IN_PROGRESS` | Estándar (Constitución VII). |

### Efecto (una sola transacción atómica)

1. Crea un `EXPENSE` real en `fromAccountId` (`prepaymentStatementId = statementId`, `prepaymentAccountId = id`, `creditStatementId = null`).
2. Decrementa el saldo de `fromAccountId`.
3. Decrementa `creditUsed` de la cuenta `id` por `amount`.
4. Sube `CreditStatement.prepaidAmount` en `amount`. El período permanece OPEN.

---

## Cambios a endpoints existentes (sin nueva ruta)

### `PATCH /api/v1/transactions/:id` y `DELETE /api/v1/transactions/:id`

Cuando el movimiento editado/eliminado tiene `prepaymentStatementId !== null`, ADEMÁS de su comportamiento actual (revertir/aplicar el efecto en la cuenta de origen), la misma operación atómica:

1. Recalcula la deuda bruta del período (`grossTotal`, sin restar ningún prepago) desde sus movimientos reales.
2. Ajusta `CreditStatement.prepaidAmount` por la diferencia (viejo monto → nuevo monto, o → `"0"` si se elimina).
3. Si el período ya estaba liquidado (`paidAt !== null`), reconcilia `paidAmount`/`carriedOverAmount` de la misma forma que `.../sync` ya hace (reutiliza `CreditStatement.syncAmount`).
4. Ajusta `creditUsed` de la cuenta CREDIT_CARD (`prepaymentAccountId`) por la diferencia.

No hay error nuevo aquí: si el nuevo monto excede lo que el período puede aceptar, sigue siendo `PAYMENT_EXCEEDS_REMAINING`.

### `GET /api/v1/transactions`, `GET /api/v1/transactions/:id`

Devuelven los dos campos nuevos (`prepaymentStatementId`, `prepaymentAccountId`) en cada `Transaction`, siempre presentes (null salvo en un movimiento de prepago).

## Formulario de movimiento (frontend, sin contrato HTTP propio)

`TransactionFormPanel`'s `mode` gana `"PREPAY"` (un modo de UI, no un `TransactionType`), ofrecido junto a `"EXPENSE"` únicamente cuando la cuenta elegida es CREDIT_CARD. Al seleccionarlo, el formulario llama a `POST .../prepay` en vez de `POST /transactions`.

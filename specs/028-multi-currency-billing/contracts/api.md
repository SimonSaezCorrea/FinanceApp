# API contracts — 028

Todas bajo `/api/v1`, autenticadas, con `userId` del JWT. Errores con código (`{ error: { code, field? } }`).

## `accounts.creditStatementSchema` (respuesta) — campos nuevos

```ts
currency: string;                       // "CLP" | "USD" | …
status: "OPEN" | "PENDING" | "PAID" | "PARTIALLY_PAID" | "TRANSFERRED";
transferredAt: string | null;           // ISO
transferredAmount: moneyString | null;  // en la moneda de la cuenta
transferredToId: string | null;         // período en la moneda de la cuenta
canTransfer: boolean;                   // derivado con accounts.canTransferStatement(...)
transferReversal: {                     // solo si TRANSFERRED; lo que "Deshacer traspaso" revertirá,
  restoredAmount: moneyString;          // calculado por la misma función que aplica el handler
  restoredCurrency: string;
  removedAmount: moneyString;
  removedCurrency: string;
} | null;
```

Helpers del contrato (compartidos UI/API): `isSettled(s)` = `paidAt !== null || transferredAt !== null`;
`canTransferStatement(s, accountCurrency, today)` (research R8).

## `GET /accounts/:id/credit-statements`

Sin cambios de forma; devuelve los períodos de **todas** las monedas, cada uno con su `currency`.

## `POST /accounts/:id/credit-statements/:statementId/pay` — cambia

Header `Idempotency-Key` (obligatorio, como hoy; operación `creditStatement.pay`).

```ts
{
  fromAccountId: rowId;
  amount?: moneyString;          // en la moneda de la FACTURACIÓN (omitido = todo lo que falta)
  chargedAmount?: moneyString;   // NUEVO — en la moneda de la cuenta de ORIGEN;
                                 // obligatorio si difiere de la de la facturación
  paidAt?: isoDate;
  reference?: string;
}
```

Errores nuevos: `STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS` (400, falta `chargedAmount`).
Existentes: `PAYMENT_EXCEEDS_REMAINING`, `INVALID_PAYMENT_AMOUNT`, `INVALID_PAYMENT_SOURCE`, `NOTHING_TO_PAY`.
Ownership de `fromAccountId`: verificado en `loadContext` (`accountRepo.findById(userId, …)`), sin cambios.

## `POST /accounts/:id/credit-statements/:statementId/transfer` — nuevo

Header `Idempotency-Key` (obligatorio; operación `creditStatement.transfer`; forma (c) del Principio VII).

```ts
{ amount: moneyString /* > 0, en la moneda de la cuenta */; transferredAt?: isoDate }
```

→ `200` con el `CreditStatement` traspasado.
Errores: `STATEMENT_NOT_TRANSFERABLE` (409: misma moneda que la cuenta, abierto, liquidado, o aún no vence),
`INVALID_PAYMENT_AMOUNT` (400), `STATEMENT_NOT_FOUND` (404).

## `DELETE /accounts/:id/credit-statements/:statementId/transfer` — nuevo (deshacer)

Header `Idempotency-Key` (obligatorio; operación `creditStatement.undoTransfer`).
→ `200` con el `CreditStatement` restaurado.
Errores: `STATEMENT_NOT_TRANSFERRED` (409), `TRANSFER_ALREADY_BILLED` (409: el período en pesos que
recibió el cargo ya está liquidado).

## `PATCH /accounts/:id/credit-statements/:statementId/payment` — cambia

```ts
{ amount: moneyString; chargedAmount?: moneyString /* NUEVO, para facturación en otra moneda */ }
```

## `POST/PATCH /accounts/:id/cards/:cardId` — regla nueva

Quitar el `CardLimit` de una moneda con uso > 0 o con período no liquidado → `CARD_LIMIT_HAS_DEBT` (409).

## `PATCH/DELETE /transactions/:id` — regla nueva

Movimiento de liquidación o cargo de traspaso → `TRANSACTION_LINKED_TO_STATEMENT` (409).

## `transactions.transactionSchema` — campos nuevos

```ts
settlesStatementId: string | null;
transferStatementId: string | null; // derivado vía CreditStatementLookupPort
transferStatementAccountId: string | null;
```

`transactions.sourceOf` gana `STATEMENT_SETTLEMENT` y `CURRENCY_TRANSFER`.

## Plantilla (`imports`)

Sin cambio de forma: una fila de Movimientos en otra moneda de una cuenta de crédito ahora se enlaza al
período abierto de esa moneda (antes no se enlazaba a ninguno).

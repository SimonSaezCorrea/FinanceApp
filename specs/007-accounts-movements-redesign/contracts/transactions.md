# Contract delta — transactions (`packages/contracts/src/transactions/index.ts`)

## createTransactionSchema

- `bankAccountId`: pasa de `optional` a **requerido** (`z.string()`).
- Nuevo `.refine`: si `type === "INCOME"` ⇒ `cardId` debe ser `undefined` (`CARD_NOT_ALLOWED` a nivel de mensaje).
- `cardId` sigue `optional` a nivel de esquema; la obligatoriedad para EXPENSE no-efectivo se valida en el **servicio** (necesita `account.type`).

## updateTransactionSchema

- Sigue `.partial()` (no fuerza `bankAccountId` para no romper edición de histórico). Las mismas reglas tipo/tarjeta se re-validan en el servicio cuando cambian `type`/`cardId`/`bankAccountId`.

## transactionFiltersSchema

- Ya soporta `type`, `bankAccountId`, `cardId`, `from`, `to`. **No cambia el contrato**; el fix es en frontend (`transactionsApi.toQuery` debe serializar `cardId`).

## Reglas de servicio (transactions.service)

Al crear/editar un movimiento:

1. Resolver `account = accounts.findOne(userId, bankAccountId)`.
2. `INCOME` ⇒ `cardId` prohibido → `CARD_NOT_ALLOWED`.
3. `EXPENSE` + `account.type === CASH` ⇒ `cardId` prohibido → `CARD_NOT_ALLOWED`.
4. `EXPENSE` + `account.type !== CASH` ⇒ `cardId` requerido → `CARD_REQUIRED`; la tarjeta debe pertenecer a la cuenta → `CARD_ACCOUNT_MISMATCH`.
5. Si `cardId` es de crédito, enforcement de cupo:
   - `used(card) + amount ≤ limit(card)` (sub-tope si es secundaria) → `CARD_SUBLIMIT_EXCEEDED`.
   - `usedTotal(principal) + amount ≤ limit(principal)` → `CARD_LIMIT_EXCEEDED`.
   - En edición: recalcular con el estado sin el movimiento previo (traspaso de usado entre tarjetas).

## Nuevos códigos de error

`CARD_REQUIRED`, `CARD_NOT_ALLOWED`, `CARD_ACCOUNT_MISMATCH`, `CARD_LIMIT_EXCEEDED`, `CARD_SUBLIMIT_EXCEEDED`.

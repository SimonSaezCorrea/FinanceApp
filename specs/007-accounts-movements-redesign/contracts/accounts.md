# Contract delta — accounts (`packages/contracts/src/accounts/index.ts`)

Cambios sobre los schemas existentes. Money = decimal strings (`moneyString`).

## cardLimitSchema

```
{ currency: string(3),
  limit: moneyString,
  initialUsed: moneyString,   // NUEVO — semilla (deuda al alta)
  used: moneyString }          // ahora SALIDA derivada = initialUsed + Σ gastos crédito
```
- En creación/edición, el cliente envía `currency`, `limit`, `initialUsed`. `used` es solo respuesta.

## cardSchema / createCardSchema

- `cardSchema`: `+ parentCardId: z.string().nullable()`.
- `createCardSchema`: `+ parentCardId: z.string().optional()`.
- Refines existentes se conservan (débito sin limits; sin monedas duplicadas). El pool crédito y la validación de que el padre exista/misma cuenta/mismo nivel se validan en el servicio (no en zod).

## bankAccountSchema / create / update

- `bankAccountSchema`: `+ accountNumber: z.string().nullable()`.
- `createBankAccountSchema`: `+ accountNumber: z.string().trim().max(50).optional()`.
- `updateBankAccountSchema`: hereda por `.partial()`.

## Endpoints (sin cambios de ruta)

- `GET /accounts`, `GET /accounts/:id` → respuesta con `accountNumber`, `cards[].parentCardId`, `cards[].limits[].{initialUsed, used}` (used agregado para principal).
- `POST /accounts`, `PATCH /accounts/:id` → aceptan `accountNumber`; `cards[]` inline aceptan `parentCardId` + `initialUsed`.
- `POST /accounts/:id/cards`, `PATCH /accounts/:id/cards/:cardId` → `parentCardId` + `initialUsed`; errores `PARENT_CARD_INVALID`.
- `DELETE /accounts/:id/cards/:cardId` → borra en cascade las secundarias de esa tarjeta.

## Nuevos códigos de error

`PARENT_CARD_INVALID` — padre inexistente, de otra cuenta, de otro `userId`, ya secundario, o kind incompatible para pool.

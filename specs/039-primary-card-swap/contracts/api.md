# API contract: cupos por moneda y cambio de principal

Prefijo `/api/v1`. Todo bajo `JwtAuthGuard`; ids validados como `rowId` (UUID v7). Errores
`{ error: { code, field? } }`.

## Cambios en `@finance/contracts` (`accounts`)

```ts
// Cupo de la cuenta en otra moneda (entrada)
export const extraCreditLimitSchema = z.object({
  currency: z.string().trim().length(3),
  limitAmount: moneyString,          // > 0
  usedInitial: moneyString.optional(),
});

// bankAccountFieldsSchema (create + update)
extraCreditLimits: z.array(extraCreditLimitSchema).optional(),
// create: solo CREDIT_CARD (refine); update: presente = reemplaza el conjunto, ausente = sin cambio

// creditPoolSchema (salida) — campo aditivo
usedInitial: moneyString.optional(),

// cardSchema.limits — para la principal: espejo de solo lectura de los cupos extranjeros
// de la cuenta (@deprecated, compatibilidad R10); para una adicional: sus sub-topes.

export const newPrimaryCardSchema = createCardSchema
  .pick({ name: true, last4: true, expiryMonth: true, expiryYear: true,
          network: true, isVirtual: true, isAdditional: true, cardholderName: true });

export const replacePrimaryCardSchema = z.object({
  action: z.enum(["DEACTIVATE", "DELETE"]),
  replacement: z.union([
    z.object({ cardId: rowId }),
    z.object({ newCard: newPrimaryCardSchema }),
  ]),
});

// Helper puro (web + api): ¿la cuenta necesita elegir principal?
export function needsPrimaryCard(account: Pick<BankAccount, "cards">): boolean;
```

## Endpoints nuevos

### `POST /accounts/:id/cards/:cardId/make-primary`

- Sin cuerpo. Responde `200` con la `BankAccount` actualizada.
- Idempotencia: forma (a), estado absoluto (repetir = no-op).
- Errores: `ACCOUNT_NOT_FOUND`/`CARD_NOT_FOUND` (404), `PRIMARY_CARD_INVALID_REPLACEMENT` (400: no
  CREDIT, inactiva).

### `POST /accounts/:id/cards/:cardId/replace-primary`

- Header `Idempotency-Key` obligatorio (`IDEMPOTENCY_KEY_REQUIRED`). Operación `card.replacePrimary`.
- Cuerpo `replacePrimaryCardSchema`. `:cardId` = la principal actual (o, en una cuenta sin principal
  activa, la principal inactiva).
- `DEACTIVATE`: `:cardId` queda `isActive=false`, adicional. `DELETE`: `:cardId` se elimina.
- `replacement.cardId`: debe ser CREDIT activa de la misma cuenta y distinta de `:cardId`.
- `replacement.newCard`: se crea CREDIT activa y queda principal.
- Responde `200` con la `BankAccount` actualizada.
- Errores: `CARD_NOT_PRIMARY` (409, `:cardId` no es la principal), `PRIMARY_CARD_INVALID_REPLACEMENT`
  (400), `PRIMARY_CARD_HAS_HISTORY` (409, DELETE con movimientos o planes), validación zod (400),
  `IDEMPOTENCY_KEY_REUSED`/`IDEMPOTENCY_IN_PROGRESS` (409).

## Endpoints existentes que cambian

| Endpoint                                                           | Cambio                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /accounts/:id/cards/:cardId`                                | `isActive:false` sobre la principal → `PRIMARY_CARD_REPLACEMENT_REQUIRED` (409). `limits` en otra moneda sobre la principal → se escriben como cupos de la cuenta (compat). `limits` de una adicional: moneda sin cupo → `CREDIT_POOL_CURRENCY_NOT_FOUND`; sobre el cupo → `CARD_SUBLIMIT_EXCEEDS_ACCOUNT`. |
| `DELETE /accounts/:id/cards/:cardId`                               | Sobre la principal → `PRIMARY_CARD_REPLACEMENT_REQUIRED` (409).                                                                                                                                                                                                                                             |
| `POST /accounts/:id/cards`                                         | Primera CREDIT: puede omitir el límite si la cuenta ya tiene `creditLimit > 0`. `limits` extranjeros de la principal → cupos de la cuenta.                                                                                                                                                                  |
| `POST /accounts`                                                   | `extraCreditLimits` (solo CREDIT_CARD). `cards[]`: los `limits` extranjeros de la principal → cupos de la cuenta.                                                                                                                                                                                           |
| `PATCH /accounts/:id`                                              | `extraCreditLimits` reemplaza el conjunto. Quitar uno en uso → `CREDIT_POOL_IN_USE` (409); bajar bajo un sub-tope → `CARD_SUBLIMIT_EXCEEDS_ACCOUNT` (400).                                                                                                                                                  |
| `POST /transactions` / `PATCH /transactions/:id`                   | Movimiento en otra moneda en cuenta CREDIT_CARD sin cupo en esa moneda → `CREDIT_POOL_CURRENCY_NOT_FOUND` (400); excede el cupo → `CARD_LIMIT_EXCEEDED`; excede sub-tope → `CARD_SUBLIMIT_EXCEEDED`. Nunca suma al cupo en pesos.                                                                           |
| `POST …/credit-statements/:id/pay` · `/prepay` · `PATCH …/payment` | Liquidación en otra moneda: INCOME sin tarjeta; sin cupo en esa moneda → `CREDIT_POOL_CURRENCY_NOT_FOUND` (antes `CARD_LIMIT_NOT_FOUND`).                                                                                                                                                                   |
| `GET /accounts` · `/accounts/:id`                                  | `creditPools` = moneda de la cuenta + cupos de la cuenta (con `usedInitial`); principal sin sub-topes propios.                                                                                                                                                                                              |

## Códigos nuevos (i18n `errors.*` es/en)

`PRIMARY_CARD_REPLACEMENT_REQUIRED`, `PRIMARY_CARD_INVALID_REPLACEMENT`, `PRIMARY_CARD_HAS_HISTORY`,
`CARD_NOT_PRIMARY`, `CREDIT_POOL_CURRENCY_NOT_FOUND`, `CREDIT_POOL_IN_USE`.

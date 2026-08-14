# Phase 1 — Contracts: cuenta prepago

Fuente única de forma: `packages/contracts/src/accounts/index.ts`. Este documento describe el delta.

## Tipos

```diff
 export const accountType = z.enum([
   "CHECKING",
   "SIGHT",
   "SAVINGS",
   "INVESTMENT",
   "CREDIT_LINE",
+  "PREPAID",       // Cuenta prepago: fondos provisionados, sin crédito, saldo nunca negativo
   "CASH",
 ]);
```

`cardKind` no cambia (`CREDIT | DEBIT | PREPAID`).

## Matriz tipo de cuenta ↔ kind de tarjeta (reemplaza a `CARDABLE_ACCOUNT_TYPES`)

```ts
/** Qué instrumentos puede llevar cada tipo de cuenta. Vacío = la cuenta no lleva tarjetas. */
export const ALLOWED_CARD_KINDS: Record<AccountType, CardKind[]>;

export function allowedCardKinds(type: AccountType): CardKind[];
export function isCardableAccountType(type: AccountType): boolean; // = allowedCardKinds(type).length > 0
export function isCardKindAllowed(type: AccountType, kind: CardKind): boolean;
```

| AccountType | allowedCardKinds |
| ----------- | ---------------- |
| CHECKING    | DEBIT, CREDIT    |
| SIGHT       | DEBIT, CREDIT    |
| CREDIT_LINE | CREDIT           |
| PREPAID     | PREPAID          |
| SAVINGS     | —                |
| INVESTMENT  | —                |
| CASH        | —                |

`CARDABLE_ACCOUNT_TYPES` se elimina como export público (su único uso era `isCardableAccountType`).

## Otros helpers

```diff
-export const ACCOUNT_NUMBER_REQUIRED_TYPES: AccountType[] = ["CHECKING", "SIGHT", "SAVINGS"];
+export const ACCOUNT_NUMBER_REQUIRED_TYPES: AccountType[] = ["CHECKING", "SIGHT", "SAVINGS", "PREPAID"];
```

`institutionKindForAccountType("PREPAID")` → `undefined` (selector sin filtrar; ver research D7).

## `cardSchema` / `createCardSchema`

```diff
 export const cardSchema = z.object({
   …
-  prepaidBalance: moneyString.nullable(),
-  prepaidInitialBalance: moneyString.nullable(),
   limits: z.array(cardLimitSchema),
 });

 export const createCardSchema = z.object({
   …
-  prepaidInitialBalance: moneyString.optional(),
 });
```

`loadPrepaidCardSchema` / `LoadPrepaidCard` se **eliminan**.

## `createBankAccountSchema`

Sin campos nuevos. Refinamientos añadidos (mismo estilo que el de `accountNumber`):

- `initialBalance` no puede ser negativo cuando `type === "PREPAID"` → `path: ["initialBalance"]`.
- `creditLimit`/`creditUsedInitial`/`billingCycleDay`/`minimumPaymentPercent` no se aceptan cuando
  `type === "PREPAID"`.
- `cards[]` inline: cada entrada debe cumplir `isCardKindAllowed(type, kind)`.

`updateBankAccountSchema` sigue derivándose de `.innerType().partial()`; la prohibición de cambiar el
tipo (INV-4) se valida en el agregado, donde se conoce el tipo actual de la fila.

## Endpoints

| Método | Ruta                               | Estado                                                      |
| ------ | ---------------------------------- | ----------------------------------------------------------- |
| POST   | `/accounts`                        | acepta `type: "PREPAID"` (+ `cards[]` inline PREPAID)       |
| PATCH  | `/accounts/:id`                    | rechaza cambio de tipo a/desde PREPAID                      |
| POST   | `/accounts/:id/cards`              | valida la matriz kind↔tipo                                  |
| PATCH  | `/accounts/:id/cards/:cardId`      | idem                                                        |
| POST   | `/accounts/:id/cards/:cardId/load` | **ELIMINADO**                                               |
| POST   | `/transactions/transfers`          | destino PREPAID permitido; origen PREPAID acotado por saldo |

## Códigos de error

| Código                              | Cuándo                                                                                                             | Estado                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT` | El kind de tarjeta no corresponde al tipo de cuenta (matriz)                                                       | **nuevo**                                                                 |
| `ACCOUNT_TYPE_CHANGE_NOT_ALLOWED`   | PATCH que cambia el tipo hacia/desde PREPAID                                                                       | **nuevo**                                                                 |
| `INVALID_INITIAL_BALANCE`           | Saldo inicial negativo en una cuenta prepago                                                                       | **nuevo**                                                                 |
| `PREPAID_INSUFFICIENT_BALANCE`      | Salida que dejaría la cuenta prepago bajo cero (gasto o traspaso)                                                  | reutilizado (cambia el texto es/en: habla de la cuenta, no de la tarjeta) |
| `ACCOUNT_CANNOT_HAVE_CARD`          | Cuenta cuyo tipo no lleva NINGUNA tarjeta (matriz vacía: SAVINGS/INVESTMENT/CASH) — se comprueba ANTES que el kind | sin cambios                                                               |
| `PREPAID_BALANCE_NOT_ALLOWED`       | —                                                                                                                  | **eliminado**                                                             |
| `INVALID_PREPAID_BALANCE`           | —                                                                                                                  | **eliminado**                                                             |

Todos los códigos nuevos requieren su clave en `apps/web/src/i18n/es.json` y `en.json`
(`errors.<CODE>`), verificado por `src/i18n/parity.test.ts`.

## Claves i18n de UI

- Nuevas: `accounts.type.PREPAID` (es: "Prepago", en: "Prepaid") y el texto de ayuda del tipo.
- Eliminadas: las del panel de recarga (`accounts.cards.load*`) y las del campo "Saldo cargado" del
  formulario de tarjeta.

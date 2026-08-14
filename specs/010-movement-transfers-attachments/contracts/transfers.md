# Contrato — Traspasos (`@finance/contracts` → `transactions`)

## Cambios en shapes existentes

```ts
// transactionSchema gana un campo (nullable, siempre presente)
transferGroupId: z.string().nullable();
```

`type` NO cambia: sigue siendo `INCOME | EXPENSE`. Un traspaso se reconoce por
`transferGroupId !== null`; el lado se deduce del `type` (`EXPENSE` = salida, `INCOME` = entrada).

Helper exportado por el contrato, para que ningún consumidor lo re-deletree:

```ts
export function isTransfer(t: Transaction): boolean;
export function transferSide(t: Transaction): "OUT" | "IN" | null;
```

`createTransactionSchema` / `updateTransactionSchema` **no** aceptan `transferGroupId`: un traspaso
solo se crea y edita por sus propios endpoints. Enviarlo se ignora (no está en el schema).

## Shapes nuevos

```ts
export const createTransferSchema = z.object({
  fromBankAccountId: z.string(),
  toBankAccountId: z.string(),
  amountOut: moneyString,
  amountIn: moneyString,
  currencyOut: z.string().trim().length(3),
  currencyIn: z.string().trim().length(3),
  occurredAt: z.string().datetime(),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(120).optional(),
  observation: z.string().trim().max(500).optional(),
  emisor: z.string().trim().max(200).optional(),
  receptor: z.string().trim().max(200).optional(),
  lugar: z.string().trim().max(200).optional(),
}).refine((t) => t.fromBankAccountId !== t.toBankAccountId, { path: ["toBankAccountId"] });

export const updateTransferSchema = createTransferSchema.innerType().partial().refine(/* idem */);

/** Las dos filas de un traspaso, como unidad. `in` sería una clave incómoda de
 *  leer en TypeScript (`t.in`), así que los lados se llaman por su papel. */
export const transferSchema = z.object({
  transferGroupId: z.string(),
  outgoing: transactionSchema, // EXPENSE en la cuenta de origen
  incoming: transactionSchema, // INCOME en la cuenta de destino
});
```

## Endpoints

| Método   | Ruta                          | Cuerpo                  | Respuesta   | Notas                                        |
| -------- | ----------------------------- | ----------------------- | ----------- | -------------------------------------------- |
| `POST`   | `/transactions/transfers`     | `createTransferSchema`  | `Transfer`  | Crea ambas filas y mueve ambos saldos, atómico |
| `GET`    | `/transactions/transfers/:groupId` | —                  | `Transfer`  | Para abrir a editar desde cualquiera de los lados |
| `PATCH`  | `/transactions/transfers/:groupId` | `updateTransferSchema` | `Transfer` | Reajusta hasta 3 saldos si cambia una cuenta  |
| `DELETE` | `/transactions/transfers/:groupId` | —                  | `204`       | Borra el par completo                         |

Se declaran **antes** de `:id` en el Facade, o Nest resolvería `transfers` como un id de movimiento
(mismo cuidado que ya exigió `/transactions/summary`).

`DELETE /transactions/:id` sobre un lado de traspaso borra el par completo (FR-015) — el usuario
borra desde la fila que está mirando y no tiene por qué saber que hay dos.

`PATCH /transactions/:id` sobre un lado de traspaso responde `409 TRANSFER_EDIT_AS_PAIR`: editar un
traspaso pasa por su endpoint de par.

## Errores

`TRANSFER_SAME_ACCOUNT` (400), `TRANSFER_TO_CREDIT_ACCOUNT` (400), `TRANSFER_ACCOUNT_NOT_FOUND` (404),
`TRANSFER_NOT_FOUND` (404), `TRANSFER_EDIT_AS_PAIR` (409).

## Efecto en agregados

`GET /transactions/summary` excluye las filas con `transferGroupId` de `currencyTotals` y de
`categories`; `total` las cuenta. Documentado en el propio schema del contrato.

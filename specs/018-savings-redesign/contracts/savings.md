# Contract: savings-goal / savings-entry (dinero real + cierre reversible)

**Feature**: 018-savings-redesign

## 1. `SavingsGoal` — schema extendido

```ts
export const savingsGoalCloseDestination = z.enum([
  "WITHDRAW_TO_ACCOUNT",
  "FREE_SAVINGS",
  "TRANSFER_TO_GOAL",
]);
export type SavingsGoalCloseDestination = z.infer<typeof savingsGoalCloseDestination>;

export const savingsGoalSchema = z.object({
  id: rowId,
  title: z.string(),
  targetAmount: moneyString,
  currency: z.string(),
  deadline: z.string().nullable(),
  notes: z.string().nullable(),                          // nuevo
  closedAt: z.string().nullable(),                        // nuevo
  closeDestination: savingsGoalCloseDestination.nullable(), // nuevo
  closeTargetGoalId: rowId.nullable(),                    // nuevo — solo TRANSFER_TO_GOAL
  // derivados, calculados en el query handler — nunca escritos por el cliente
  savedAmount: moneyString,                               // nuevo
  pace: moneyString,                                      // nuevo
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

`closeAccountId`/`closeTransactionId`/`closeAmount` (bookkeeping de reversión) **NO se exponen en el
DTO** — son detalle de infraestructura interno, igual que `Debt.lastPayment*` sí se exponen porque el
frontend los usa para UI ("modificar pago"), pero acá no hay UI equivalente que necesite mostrarlos
directamente (el bloque de "metas cerradas" ya obtiene "destino" de `closeDestination` +
`closeTargetGoalId`, y el nombre de la cuenta si hace falta se resuelve por separado vía
`GET /accounts` con el `closeAccountId` si se decide exponerlo más adelante — fuera de alcance ahora).

```ts
export const createSavingsGoalSchema = z.object({
  title: z.string().trim().min(1).max(160),
  targetAmount: moneyString,
  currency: z.string().trim().length(3).default("USD"),
  deadline: z.string().datetime().optional(),
  notes: z.string().trim().max(500).optional(),           // nuevo
});

export const updateSavingsGoalSchema = createSavingsGoalSchema.partial().extend({
  currency: z.string().trim().length(3).optional(),
});
// currency se acepta en el body pero el handler la rechaza (SAVINGS_GOAL_CURRENCY_LOCKED)
// si la meta ya tiene algún aporte — la validación vive en el dominio, no en el schema,
// porque depende de un conteo (no de la forma del body).
```

## 2. Cerrar / reabrir una meta

```
POST /savings/goals/:id/close
Idempotency-Key: <requerido>
```

```ts
export const closeSavingsGoalSchema = z.discriminatedUnion("destination", [
  z.object({
    destination: z.literal("WITHDRAW_TO_ACCOUNT"),
    accountId: rowId,
    closedAt: z.string().datetime().optional(),
  }),
  z.object({
    destination: z.literal("FREE_SAVINGS"),
    closedAt: z.string().datetime().optional(),
  }),
  z.object({
    destination: z.literal("TRANSFER_TO_GOAL"),
    targetGoalId: rowId,
    closedAt: z.string().datetime().optional(),
  }),
]);
export type CloseSavingsGoal = z.infer<typeof closeSavingsGoalSchema>;
```

Respuesta: `SavingsGoal` actualizado (201 → 200, ya existe la meta). `closedAt` por defecto = ahora
si se omite.

```
POST /savings/goals/:id/reopen
Idempotency-Key: <requerido>
```

Sin body. Respuesta: `SavingsGoal` actualizado, `closedAt: null`.

Ambas rutas van **antes** de cualquier ruta con `:id` genérica en el controller (mismo cuidado de
orden que `transfers/:groupId` antes de `:id` documentado en la constitución §Identificadores).

## 3. `SavingsEntry` — dinero real

```ts
export const savingsEntrySchema = z.object({
  id: rowId,
  savingsGoalId: rowId.nullable(),
  amount: moneyString,
  currency: z.string(),
  contributedAt: z.string(),
  note: z.string().nullable(),
  bankAccountId: rowId.nullable(),   // nuevo — nullable porque sobrevive el borrado de la cuenta
  createdAt: z.string(),
});

export const createSavingsEntrySchema = z.object({
  amount: moneyString,
  currency: z.string().trim().length(3).default("USD"),
  contributedAt: z.string().datetime(),
  savingsGoalId: rowId.optional(),
  bankAccountId: rowId,               // nuevo, REQUERIDO — antes no existía
  note: z.string().trim().max(500).optional(),
});

export const updateSavingsEntrySchema = createSavingsEntrySchema.partial().extend({
  currency: z.string().trim().length(3).optional(),
});
```

`POST /savings/entries`, `PATCH /savings/entries/:id`, `DELETE /savings/entries/:id` **requieren
todos `Idempotency-Key`** (antes solo `POST`). `create` ya estaba en `IDEMPOTENT_OPERATIONS`; se
agregan `"savingsEntry.update"` y `"savingsEntry.remove"`.

Reglas de negocio (handler, no schema — dependen de estado):
- `bankAccountId` debe ser del usuario, no `CREDIT_LINE`, y de la misma moneda que `currency`
  (`SAVINGS_ENTRY_FROM_CREDIT_ACCOUNT` / `SAVINGS_ENTRY_CURRENCY_MISMATCH`).
- Si `savingsGoalId` está presente, su moneda debe coincidir con `currency`
  (`SAVINGS_ENTRY_CURRENCY_MISMATCH`) y la meta no puede estar cerrada (`SAVINGS_GOAL_CLOSED`).
- Saldo: se valida con `MovementPolicy.assertWithinPrepaidBalance/assertWithinOverdraft/
assertWithinCeiling` — las mismas reglas que cualquier otro movimiento de la app, no una nueva
  (ver research.md §3).
- Editar (`PATCH`) que cambia `amount`/`bankAccountId`/`currency` revierte el movimiento anterior y
  aplica el nuevo dentro de la MISMA transacción (mismo patrón que mover una `Transaction` de cuenta,
  ver `transaction/domain/balance-delta.ts`).
- Eliminar revierte el movimiento (borra el `Transaction`, restaura el saldo).

## 4. Errores nuevos → `es.json`/`en.json`

Todos 409 salvo que se indique. Ver `data-model.md` §Errores para la lista completa y cuándo dispara
cada uno; las claves de traducción siguen el patrón `errors.<CODE>` ya establecido.

## 5. `GET /savings/summary` (nuevo)

```
GET /savings/summary
```

```ts
export const savingsSummarySchema = z.object({
  totalSaved: moneyString,      // metas abiertas+cumplidas + ahorro libre, EXCLUYE cerradas
  freeSavingsTotal: moneyString,
  pace: moneyString,            // suma de pace de metas abiertas (no cumplidas ni cerradas... ver nota)
  missing: moneyString,         // Σ max(0, target - saved) de metas abiertas
});
export type SavingsSummary = z.infer<typeof savingsSummarySchema>;
```

Nota de alcance: "ritmo mensual combinado" (FR-007) suma el `pace` de las metas **abiertas**
(`live` + `late` en la terminología del README, es decir ni cumplidas ni cerradas) — una meta
cumplida ya no necesita ritmo, así que no se cuenta ahí (coherente con que tampoco cuenta en
"falta por reunir").

## 6. `transactions.sourceOf()` — extensión

```ts
export type TransactionSource =
  | { kind: "TRANSFER" }
  | { kind: "INSTALLMENT_INTEREST" }
  | { kind: "INSTALLMENT" }
  | { kind: "FINANCE_CHARGE" }
  | { kind: "DEBT" }
  | { kind: "SAVINGS" }              // nuevo
  | { kind: "SAVINGS_WITHDRAWAL" }   // nuevo
  | { kind: "MANUAL" };
```

Insertado antes del caso `DEBT` en el orden de prioridad de `sourceOf()` (los cinco casos existentes
son mutuamente excluyentes por construcción — un movimiento nunca lleva más de una de estas FKs a la
vez — así que el orden exacto solo importa por legibilidad, no por corrección).

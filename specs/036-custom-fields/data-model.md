# Data Model: Campos personalizados (036)

Dos tablas nuevas, un enum nuevo. Ids UUID v7 (`@default(uuid(7))`, Principio VIII); los ids de
opción se acuñan con `generateRowId()`.

## Enum `CustomFieldType`

`BOOLEAN | TEXT | NUMBER | DATE | OPTION`

## Enum `CustomFieldMovementKind`

`EXPENSE | INCOME | TRANSFER` — TRANSFER = cualquier lado de un traspaso (`transferGroupId` no nulo);
un lado de traspaso NO cuenta como EXPENSE/INCOME para el alcance.

## `CustomField` (tabla `custom-field`, dominio `custom-field`)

| Campo                 | Tipo                           | Notas                                                                                     |
| --------------------- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| id                    | UUID v7                        | PK                                                                                        |
| userId                | FK → User, `onDelete: Cascade` | aislamiento (II)                                                                          |
| name                  | String (1–40)                  | lo que escribe la persona; no se traduce                                                  |
| nameKey               | String                         | `name` en minúsculas, sin tildes ni espacios repetidos; `@@unique([userId, nameKey])`     |
| type                  | CustomFieldType                | fijo desde que `valueCount > 0`                                                           |
| options               | Json, default `[]`             | `[{ id: uuidv7, label: string(1–40) }]`, ≤ 50, labels únicos por `nameKey`; solo OPTION   |
| scopeMovementKinds    | CustomFieldMovementKind[]      | vacío = todos                                                                             |
| scopeRestrictAccounts | Boolean, default false         |                                                                                           |
| scopeAccountIds       | String[]                       | ids de `BankAccount` (no FK); con `scopeRestrictAccounts=true` y vacío = no aplica a nada |
| scopeCardKinds        | CardKind[]                     | vacío = sin restricción; con valores, un movimiento sin tarjeta no aplica                 |
| defaultValue          | Json?                          | `{ "value": <typed> }` según el tipo; para OPTION un `id` de `options`                    |
| showAsColumn          | Boolean, default false         |                                                                                           |
| sortOrder             | Int                            | orden de creación; define el orden de columnas e inputs                                   |
| createdAt / updatedAt | DateTime                       |                                                                                           |

Índices: `@@index([userId, sortOrder])`.

**Invariantes (agregado `CustomField`)**

- ≤ 20 campos por persona (`CUSTOM_FIELD_LIMIT_REACHED`, contado en el handler de creación).
- Nombre único por persona (`CUSTOM_FIELD_NAME_TAKEN`).
- `changeType` rechazado si `valueCount > 0` (`CUSTOM_FIELD_TYPE_LOCKED`).
- `removeOption(id)` rechazado si algún valor la usa (`CUSTOM_FIELD_OPTION_IN_USE`).
- `defaultValue` debe ser válido para el tipo (`CUSTOM_FIELD_INVALID_VALUE`, `field: "defaultValue"`).
- `parseValue(raw)` → valor tipado o error: BOOLEAN boolean; TEXT string trim 1–200; NUMBER string
  decimal (≤ 16 enteros, ≤ 8 decimales); DATE `YYYY-MM-DD`; OPTION id existente en `options`.
- `appliesTo(shape)` con `shape = { kind, bankAccountId, cardKind | null }`.
- `showsFor(shape, hasValue)` = `appliesTo(shape) || hasValue` (FR-009).

## `TransactionFieldValue` (tabla `transaction-field-value`, dominio `transaction-field-value`)

| Campo                    | Tipo                                  | Notas                                                                                     |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| id                       | UUID v7                               | PK                                                                                        |
| userId                   | FK → User, `onDelete: Cascade`        | toda consulta se acota por `userId`                                                       |
| transactionId            | FK → Transaction, `onDelete: Cascade` | borrar el movimiento borra sus valores                                                    |
| customFieldId            | FK → CustomField, `onDelete: Cascade` | borrar el campo borra sus valores (FR-006)                                                |
| booleanValue             | Boolean?                              | exactamente una columna de valor no nula, la del tipo                                     |
| textValue                | String? (≤ 200)                       |                                                                                           |
| numberValue              | Decimal(24,8)?                        |                                                                                           |
| dateValue                | DateTime? `@db.Date`                  |                                                                                           |
| optionId                 | String?                               | id dentro de `CustomField.options`                                                        |
| coveredByTransferGroupId | String?                               | P2: el traspaso de "Transferir pendientes" que lo cubrió (no FK: un grupo no es una fila) |
| coverPreviousValue       | Json?                                 | P2: `{ "value": <typed> \| null }` — lo que tenía antes; `null` interno = "sin valor"     |
| updatedAt                | DateTime                              |                                                                                           |

Restricciones: `@@unique([transactionId, customFieldId])` (llave natural, idempotencia forma (b)).
Índices: `@@index([customFieldId, booleanValue])`, `@@index([customFieldId, optionId])`,
`@@index([customFieldId, numberValue])`, `@@index([customFieldId, dateValue])`,
`@@index([userId, coveredByTransferGroupId])`.

"Sin valor" = no existe fila. Asignar "sin valor" borra la fila.

**Transiciones de una fila**

```
(sin fila) --default/PATCH/bloque/import--> valor
valor --PATCH/bloque--> otro valor            (limpia cobertura)
valor --PATCH/bloque "sin valor"--> (sin fila)
(sin fila|valor) --cover--> valor destino + coveredByTransferGroupId + coverPreviousValue
cubierto --borrar traspaso--> coverPreviousValue (o sin fila) y sin cobertura
cubierto --editar a mano--> nuevo valor, sin cobertura (borrar el traspaso ya no lo toca)
```

## Cambios en tablas existentes

Ninguna columna nueva en tablas existentes. Relaciones inversas en Prisma: `User.customFields`,
`User.transactionFieldValues`, `Transaction.customFieldValues`, `CustomField.values`.

## Puertos nuevos o ampliados

| Puerto                                                      | Dominio dueño           | Métodos                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CustomFieldRepositoryPort`                                 | custom-field            | `listForUser`, `findOwned`, `countForUser`, `create(WithTx)`, `save`, `remove`, `removeAccountFromScopesWithTx(tx, userId, accountId)`, `clearAccountScopesWithTx(tx, userId)` (REPLACE de plantilla)                                                                                                                                                                                                               |
| `TransactionFieldValueRepositoryPort`                       | transaction-field-value | `listForTransactions(userId, ids)`, `countByField(userId)`, `countByOption(fieldId, optionId)`, `idsMatching(userId, fieldId, predicate)`, `idsWithValue(userId, fieldId)`, `valuesFor(userId, fieldId, ids)`, `upsertManyWithTx`, `deleteManyWithTx`, `revertIfUnchangedWithTx` (deshacer bloque), `lockForCoverWithTx`, `coverWithTx`, `revertCoverWithTx(tx, userId, groupIds)`, `coveredCount(userId, groupId)` |
| `TransactionScopeLookupPort` (nuevo, hoja de `transaction`) | transaction             | `countInScope(userId, scopeWhere)`, `idsInScope(userId, scopeWhere, limit)`, `idsForFilter(userId, filter, limit)`, `shapesFor(userId, ids)` → `{id, kind, bankAccountId, cardId, currency, amount, type}`                                                                                                                                                                                                          |
| `CardAccountRepositoryPort` (ampliado)                      | card-account            | `idsByKind(userId, kinds)`                                                                                                                                                                                                                                                                                                                                                                                          |
| `TransactionListFilter` (ampliado)                          | transaction             | `ids?: { in?: string[]; notIn?: string[] }`, `scope?: ScopeWhere`                                                                                                                                                                                                                                                                                                                                                   |

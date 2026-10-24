# Contrato HTTP: Campos personalizados (036)

Prefijo `/api/v1`. Todo requiere sesión (`JwtAuthGuard`) y se acota al usuario. Ids validados con
`rowId` (UUID v7) → `400 INVALID_ID_FORMAT`. Errores con `{ error: { code, field? } }`.
Schemas zod nuevos en `packages/contracts/src/custom-fields/` (`customFields`), ampliaciones en
`transactions` e `imports`.

## Tipos compartidos

```ts
type CustomFieldType = "BOOLEAN" | "TEXT" | "NUMBER" | "DATE" | "OPTION";
type CustomFieldValue = boolean | string; // NUMBER = decimal string; DATE = "YYYY-MM-DD"; OPTION = option id
type CustomFieldScope = {
  movementKinds: ("EXPENSE" | "INCOME" | "TRANSFER")[];
  accountIds: string[]; // rowId[]; naming accounts is what restricts the scope
  cardKinds: ("CREDIT" | "DEBIT" | "PREPAID")[];
};
type CustomField = {
  id: string;
  name: string;
  type: CustomFieldType;
  options: { id: string; label: string }[];
  scope: CustomFieldScope;
  defaultValue: CustomFieldValue | null;
  showAsColumn: boolean;
  sortOrder: number;
  valueCount: number; // FR-006 (confirmación) y bloqueo de tipo
  scopeBroken: boolean; // restrictAccounts && accountIds vacío
};
```

## `custom-field`

| Método y ruta                                             | Cuerpo                                                                                   | Respuesta                                                            | Errores                                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /custom-fields`                                      | —                                                                                        | `CustomField[]` por `sortOrder`                                      | —                                                                                                                                                    |
| `POST /custom-fields`                                     | `{ name, type, options?, scope, defaultValue?, showAsColumn?, applyDefaultToExisting? }` | 201 `CustomField`                                                    | `CUSTOM_FIELD_NAME_TAKEN` 409, `CUSTOM_FIELD_LIMIT_REACHED` 409, `CUSTOM_FIELD_INVALID_VALUE` 400, `ACCOUNT_NOT_FOUND` (cuenta del alcance ajena)    |
| `PATCH /custom-fields/:id`                                | parcial de lo anterior + `options` completas (ids existentes conservan; sin id = nueva)  | `CustomField`                                                        | + `CUSTOM_FIELD_NOT_FOUND` 404, `CUSTOM_FIELD_TYPE_LOCKED` 409, `CUSTOM_FIELD_OPTION_IN_USE` 409                                                     |
| `DELETE /custom-fields/:id`                               | —                                                                                        | 204                                                                  | `CUSTOM_FIELD_NOT_FOUND`                                                                                                                             |
| `POST /custom-fields/scope-count`                         | `{ scope }`                                                                              | `{ count }` (FR-005)                                                 | —                                                                                                                                                    |
| `POST /custom-fields/:id/assignments/preview`             | `{ target, value }`                                                                      | `{ inScope, outOfScope, withOtherValue }`                            | `CUSTOM_FIELD_ASSIGNMENT_TOO_LARGE` 400                                                                                                              |
| `POST /custom-fields/:id/assignments` (`Idempotency-Key`) | `{ target, value: CustomFieldValue \| null }`                                            | `{ changed, skipped, previous: { transactionId, value \| null }[] }` | + `CUSTOM_FIELD_INVALID_VALUE`                                                                                                                       |
| `POST /custom-fields/:id/assignments/revert`              | `{ appliedValue, restore: { transactionId, value \| null }[] }`                          | `{ restored, kept }`                                                 | —                                                                                                                                                    |
| `PATCH /transactions/:id/custom-fields`                   | `{ values: Record<fieldId, CustomFieldValue \| null> }`                                  | `{ customFields: Record<fieldId, CustomFieldValue> }`                | `TRANSACTION_NOT_FOUND`, `CUSTOM_FIELD_NOT_FOUND`, `CUSTOM_FIELD_INVALID_VALUE`, `CUSTOM_FIELD_NOT_APPLICABLE` (fuera de alcance y sin valor previo) |

`target = { ids: rowId[] } | { filter: TransactionFilters }` (≤ 5.000 movimientos resueltos).
`PATCH /transactions/:id/custom-fields` funciona aunque el movimiento sea de solo lectura (FR-012).

## `transaction` (ampliaciones)

- **Filtros** (`transactionFiltersSchema`, query de `GET /transactions` y `/summary`):
  `cf` (rowId del campo) + uno de: `cfv` (valor exacto: `true|false`, option id),
  `cfEmpty=true`, `cfHasValue=true` (cualquier valor), `cfText` (contiene), `cfMin`/`cfMax`
  (número o fecha). Sin `cf` los demás se
  ignoran; con `cf` y ninguno → `400 CUSTOM_FIELD_FILTER_INVALID`. `CUSTOM_FIELD_NOT_FOUND` si el
  campo no es del usuario.
- **Movimiento** (`transactionSchema`): `customFields?: Record<fieldId, CustomFieldValue>` (solo con
  valor; opcional por compatibilidad de deploy).
- **Crear** (`POST /transactions`, `POST /transactions/transfers`): `customFields?:
Record<fieldId, CustomFieldValue | null>` (en traspasos: `outgoingCustomFields` /
  `incomingCustomFields`). Lo omitido toma el default si el campo aplica; `null` = "sin valor" explícito.
  `PATCH /transactions/:id` NO toca campos (se editan con el endpoint propio).
- `GET /transactions/summary/by-field/:fieldId` → `{ buckets: { key: "true"|"false"|optionId|"hasValue"|"empty", total, currencyTotals[] }[] }` (FR-016c; mismas reglas que `/summary`).
- `GET /transactions/transfers/:groupId` gana `coveredCount` (FR-025, confirmación de borrado).
- **P2** `POST /transactions/transfers/cover` (`Idempotency-Key`):
  `{ fieldId, target, value: boolean, fromAccountId, toAccountId, occurredAt?, description? }` →
  201 `{ transfer: Transfer, covered: number }`. Errores: los de un traspaso, más
  `COVER_FIELD_NOT_BOOLEAN` 400, `COVER_SELECTION_INVALID` 400 (`field: "mixedTypes" |
"mixedCurrencies" | "currencyMismatch" | "transferLegs" | "outOfScope" | "empty"`),
  `COVER_SELECTION_CHANGED` 409.

## `import` (ampliaciones)

- `importRowSchema` y las filas de Movimientos/Traspasos de `templateImportRequestSchema` ganan
  `customFields?: Record<fieldId, CustomFieldValue | null>`.
- Una fila con un valor inválido o para un campo que no aplica responde los mismos códigos del
  dominio (`CUSTOM_FIELD_INVALID_VALUE`, `CUSTOM_FIELD_NOT_APPLICABLE`) con `field: "rows.<i>"`
  (cartola) o `"<sheet>.<row>"` (plantilla); en la vista previa de la plantilla, como problema de esa
  fila.

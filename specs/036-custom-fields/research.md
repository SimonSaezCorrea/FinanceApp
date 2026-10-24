# Research: Campos personalizados en los movimientos (036)

Decisiones técnicas que resuelven la spec. Formato: Decisión / Por qué / Alternativas.

## R1. Dos tablas, dos dominios, y dónde viven las reglas

**Decisión**: `custom-field` (definición) y `transaction-field-value` (valor por movimiento), una
carpeta por tabla (Principio VI). `custom-field` tiene las cuatro capas: el agregado `CustomField`
es dueño de las reglas de valor (`parseValue`, `appliesTo`, bloqueo de tipo, opciones).
`transaction-field-value` solo tiene `domain/` (entidad + puerto) e `infrastructure/` (único
adapter de la tabla), igual que `savings-entry`/`installment-payment`: se escribe siempre a través
de un handler que ya validó con el agregado. Ambas exponen hoja `*.data.module.ts`.

**Por qué**: un valor no tiene sentido sin la definición de su campo (tipo, opciones, alcance);
concentrar esa validación en un agregado evita que el create de movimientos, el PATCH de valores,
el marcado en bloque y la importación validen cada uno a su manera.

**Alternativas**: una sola tabla con los valores en `Json` sobre `Transaction` (rompe "una tabla =
un dominio" porque `transaction` pasaría a validar reglas de otro agregado, y filtrar/rango sobre
JSON es frágil); EAV genérico para cualquier entidad (fuera de alcance: solo movimientos).

## R2. Almacenar el valor: columnas tipadas, "sin valor" = sin fila

**Decisión**: una fila por (movimiento, campo) con columnas tipadas `booleanValue`,
`textValue`, `numberValue Decimal(24,8)`, `dateValue @db.Date`, `optionId`; exactamente una no
nula según el tipo del campo. "Sin valor" es la **ausencia de fila** (asignar "sin valor" borra la
fila). `@@unique([transactionId, customFieldId])`.

**Por qué**: FR-010 exige que "sin valor" sea distinto de "No"; sin fila es la forma que no admite
estados intermedios. Columnas tipadas permiten filtros exactos y por rango (FR-013) con índices
normales, y `Decimal` respeta el Principio I aunque el número no sea dinero.

**Alternativas**: un `value String` normalizado (rangos numéricos/fecha por comparación de strings,
error-prone); `Json` (sin índices útiles).

## R3. Opciones de lista con id estable

**Decisión**: `CustomField.options Json` = `[{ id: uuidv7, label }]`; el valor guarda `optionId`.
Renombrar cambia `label` sin tocar valores; quitar una opción exige que ningún valor la use
(`CUSTOM_FIELD_OPTION_IN_USE`, conteo por `optionId` vía el puerto de valores). ≤ 50 opciones.

**Por qué**: el valor sobrevive al renombre; una tabla de opciones sería un tercer dominio para un
dato que solo vive dentro del campo.

## R4. Alcance

**Decisión**: tres dimensiones en `custom-field`: `scopeMovementKinds CustomFieldMovementKind[]`
(EXPENSE/INCOME/TRANSFER — TRANSFER = cualquier lado de un traspaso, que deja de contar como
EXPENSE/INCOME para el alcance), `scopeRestrictAccounts Boolean` + `scopeAccountIds String[]`, y
`scopeCardKinds CardKind[]`. Lista vacía = sin restricción, salvo cuentas, donde
`scopeRestrictAccounts=true` con lista vacía significa "no aplica a nada" (todas sus cuentas se
eliminaron; la UI lo señala). Una función pura `appliesTo(scope, shape)` en el dominio de
`custom-field` decide, con `shape = { kind, bankAccountId, cardKind | null }`. La misma regla se
traduce a un `where` de movimientos para contar/listar en bloque (R7).

**Por qué**: el flag separado evita que borrar la última cuenta del alcance lo convierta en "todas
las cuentas" en silencio. `scopeAccountIds` no es FK (es un arreglo); eliminar una cuenta la quita
de todos los alcances en la misma transacción que la elimina (`bank-account` y el REPLACE de la
plantilla llaman `CustomFieldRepositoryPort.removeAccountFromScopesWithTx`).

## R5. Qué movimientos reciben el valor por defecto

**Decisión**: reciben defaults los movimientos que **crea la persona**: `POST /transactions`
(incluye Duplicar, que además manda los valores del original), `POST /transactions/transfers`
(cada lado según su alcance), `POST /import/transactions` y `POST /import/template`. Los
movimientos que el sistema crea como efecto de otra acción (pago/prepago/traspaso de facturación,
pago de cuota o deuda, aporte/retiro de ahorro, el traspaso de "Transferir pendientes") **no**
reciben defaults; se pueden marcar a mano.

**Por qué**: un default en un pago de facturación o un aporte de ahorro casi nunca es lo que la
persona quiso decir con su campo, y meterlo en ocho handlers ajenos multiplica el radio de cambio.
Se registra en Assumptions de la spec.

Los handlers de creación cargan los campos del usuario una vez (`CustomFieldRepositoryPort.
listForUser`), combinan defaults + valores explícitos del cuerpo (`customFields: {fieldId: value|null}`),
validan con el agregado y escriben con `TransactionFieldValueRepositoryPort.upsertManyWithTx`
dentro de la `$transaction` que ya tienen. Un valor explícito para un campo fuera de alcance →
`CUSTOM_FIELD_NOT_APPLICABLE` (400, `field: "customFields.<id>"`).

## R6. Filtrar sin cruzar tablas: conjuntos de ids

**Decisión**: el filtro llega al dominio `transaction` como `TransactionListFilter.customField`.
`toListFilter` pasa a ser asíncrono en los handlers de lista/resumen y lo resuelve con los puertos
de los otros dominios: el puerto de valores devuelve los `transactionId` que cumplen el predicado
(`valueIn`, `textContains`, rango), y el `where` del adapter de `transaction` recibe
`id: { in: ids }`. Para "sin valor": `id: { notIn: idsConValor }` **y** el `where` del alcance del
campo (R7). El adapter de `transaction` nunca toca la tabla de valores.

**Por qué**: Principio VI prohíbe que el adapter de `transaction` lea `transaction-field-value`
(un `some`/`none` de Prisma o un `EXISTS` crudo serían exactamente eso). La lista de ids está
acotada por los movimientos de UNA persona.

**Límite conocido**: Postgres acepta hasta 65.535 parámetros por consulta; con más de ~30.000
movimientos con valor en un mismo campo el filtro tendría que pasar a una tabla temporal o a una
excepción documentada. Hoy la persona con más datos tiene < 3.000 movimientos. Se registra en
`docs/PENDING.md`.

**Alternativas**: relación Prisma `fieldValues: { some }` desde el adapter de `transaction`
(violación de VI, descartada); vista materializada (sobra para el volumen).

## R7. El alcance como filtro de movimientos

**Decisión**: `transaction` gana una función pura `scopeWhere(scope, creditCardIdsByKind)` que
traduce el alcance: kinds → `type` + `transferGroupId null/not null`; cuentas → `bankAccountId in`;
clases de tarjeta → `cardId in <ids de tarjetas de esas clases>` (resueltos por
`CardAccountRepositoryPort.idsByKind`, nuevo). Un puerto angosto nuevo en la hoja de
`transaction`, `TransactionScopeLookupPort` (`countInScope`, `idsInScope`, `shapesFor(ids)`),
lo expone a `custom-field` para: contar al crear (FR-005), aplicar default a existentes,
"seleccionar todos los del filtro" (FR-015) y verificar ownership+alcance en el marcado en bloque.

## R8. Endpoints y dónde viven

**Decisión**:

- `custom-field` (Facade `CustomFieldsController`): `GET/POST /custom-fields`,
  `PATCH/DELETE /custom-fields/:id`, `POST /custom-fields/scope-count` (preview de FR-005),
  `POST /custom-fields/:id/assignments/preview`, `POST /custom-fields/:id/assignments` (bloque),
  `POST /custom-fields/:id/assignments/revert` (deshacer).
- `custom-field` (segunda Facade `TransactionCustomFieldsController`, mismo precedente que
  `transaction-attachment`): `PATCH /transactions/:id/custom-fields` — editar valores de UN
  movimiento, permitido aunque el movimiento sea de solo lectura (FR-012), porque no pasa por
  `UpdateTransactionHandler`.
- `transaction`: `GET /transactions` y `/summary` aceptan el filtro; `GET /transactions/summary/
by-field/:fieldId` (FR-016c, declarado antes de `:id`); `POST /transactions/transfers/cover`
  (P2, "Transferir pendientes").
- Respuestas de movimiento ganan `customFields: Record<fieldId, value>` (opcional en el schema para
  que una app nueva siga leyendo una API vieja durante un deploy), cargado por página en UNA
  consulta al puerto de valores, como el overlay de `paidStatementId`.

## R9. Idempotencia por endpoint (Principio VII)

| Endpoint                                | Forma | Mecanismo                                                                                                                                         |
| --------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /custom-fields`                   | (b)   | `@@unique([userId, nameKey])`; el replay responde `CUSTOM_FIELD_NAME_TAKEN` sin crear otro. El "aplicar a existentes" va en la misma transacción. |
| `PATCH /custom-fields/:id`              | (b)   | Estado absoluto sobre la fila por PK; repetirlo no cambia nada.                                                                                   |
| `DELETE /custom-fields/:id`             | (a)   | Borrado terminal; el replay responde `CUSTOM_FIELD_NOT_FOUND`.                                                                                    |
| `PATCH /transactions/:id/custom-fields` | (b)   | Upsert/delete absoluto sobre `@@unique([transactionId, customFieldId])`.                                                                          |
| `POST …/assignments`                    | (c)   | `Idempotency-Key`, operación `customField.assign`; el replay devuelve la misma respuesta (incluida la lista `previous` que necesita "Deshacer").  |
| `POST …/assignments/revert`             | (a)   | Compare-and-set: solo cambia filas cuyo valor actual sigue siendo el que puso la asignación; un replay no encuentra nada que cambiar.             |
| `POST /transactions/transfers/cover`    | (c)   | Mueve saldo: `Idempotency-Key`, operación `transaction.coverTransfer`, todo en una `$transaction`.                                                |

`POST /custom-fields/scope-count` y `POST …/assignments/preview` son lecturas (POST solo porque el
cuerpo lleva un alcance o un filtro): no escriben y no necesitan idempotencia.

## R10. Deshacer el marcado en bloque (FR-016a/b)

**Decisión**: la respuesta de `assignments` trae `{ changed, skipped, previous: [{transactionId,
value|null}] }`. "Deshacer" (aviso de sonner con acción, 10 s) envía `revert` con `{ appliedValue,
restore: previous }`; el servidor restaura solo donde el valor actual sigue igual a `appliedValue`
(los editados entretanto se respetan). La confirmación previa usa `assignments/preview`
(`{ inScope, outOfScope, withOtherValue }`), y la web la pide cuando `inScope > 20`. Tope de una
asignación: 5.000 movimientos (`CUSTOM_FIELD_ASSIGNMENT_TOO_LARGE`).

**Por qué**: no guarda historial en el servidor y el compare-and-set cumple "salvo los editados
entretanto" sin estado extra.

## R11. "Transferir pendientes" (P2) y su deshacer al borrar el traspaso

**Decisión**: `CoverWithTransferHandler` (dominio `transaction`, idempotente (c)):

1. Resuelve los movimientos (ids o filtro), verifica ownership, que el campo sea sí/no, que todos
   estén en su alcance, sean del mismo tipo (EXPENSE o INCOME, sin lados de traspaso) y de una
   moneda igual a la de ambas cuentas (`COVER_SELECTION_INVALID` con `reason`).
2. Monto = suma (`@finance/money`). Valida con `TransferPolicy` igual que un traspaso a mano
   (incluido pagar una tarjeta de crédito como destino).
3. En UNA `$transaction`: bloquea las filas de valor de esos movimientos
   (`lockForCoverWithTx`, `SELECT … FOR UPDATE` + inserción con `ON CONFLICT` para los que no
   tienen fila); si alguno ya tiene el valor destino o ya está cubierto, aborta
   (`COVER_SELECTION_CHANGED`); escribe el par de traspaso con la misma función que
   `CreateTransferHandler` (se extrae `writeTransferPairWithTx` a `application/transfer-legs.ts`);
   y escribe los valores con `coveredByTransferGroupId` + `coverPreviousValue`.

**Deshacer (FR-025)**: `TransactionFieldValueRepositoryPort.revertCoverWithTx(tx, groupIds)`
restaura `coverPreviousValue` (o borra la fila si era "sin valor") en las filas que siguen cubiertas
y limpia las referencias. Se llama en la misma transacción desde: `RemoveTransferHandler`,
`RemoveTransactionHandler` (borrar un lado borra el par) y la eliminación de cuenta
(`bank-account/application/account-deletion.ts`, cuando se lleva traspasos). **Una edición manual
del valor (PATCH o asignación en bloque) limpia las referencias de cobertura**, así que "lo que
siga cubierto" es exactamente lo que no se tocó. `GET /transactions/transfers/:groupId` gana
`coveredCount` para que la confirmación de borrado diga cuántos vuelven atrás.

## R12. Plantilla de importación

**Decisión**: columnas dinámicas, sin subir `TEMPLATE_VERSION`: `buildTemplate` agrega al final de
Movimientos (y de Traspasos para campos cuyo alcance incluye TRANSFER) una columna por campo,
encabezado = nombre del campo, lista desplegable para sí/no y listas, nota con tipo y alcance.
`readTemplate` reconoce esas columnas por nombre (normalizado como `nameKey`) contra los campos del
usuario; una columna desconocida se sigue ignorando como hoy. `resolveTemplate` valida localmente;
el request gana `customFields: Record<fieldId, value>` por fila; `planTemplateImport` reporta
`IMPORT_CUSTOM_FIELD_INVALID` / `IMPORT_CUSTOM_FIELD_NOT_APPLICABLE` con hoja/fila;
`ImportTemplateHandler` escribe los valores tras crear los movimientos (defaults incluidos, R5).
La plantilla "con mis datos actuales" escribe los valores existentes. Sí/No se escriben y leen en
el idioma de la plantilla (es/en).

## R13. Web

**Decisión**: dominio nuevo `apps/web/src/domains/custom-fields/` con ruta `/custom-fields`
(barra lateral "Campos", grupo "Tu dinero", después de Importar; ícono Lucide `SlidersHorizontal`),
lista de campos con su resumen por valor (cada valor enlaza a `/transactions?cf=<id>&cfv=<valor>`),
`CustomFieldFormPanel` (FormSurface panel), `DeleteCustomFieldConfirm`. En Movimientos:
`CustomFieldFilter` en `TransactionFiltersBar` (estado en la URL, igual que los demás filtros),
`CustomFieldInputs` en `TransactionFormPanel` y `TransactionDetailPanel`, columnas dinámicas en la
tabla ancha (texto bajo la descripción en la lista compacta), y un **modo selección** nuevo en
`TransactionTable` (casillas + "seleccionar todos los del filtro") con barra de acciones
`BulkAssignBar` y, en P2, `CoverTransferPanel`. Sin dependencias nuevas.

## R14. Migración

**Decisión**: una migración solo de expansión (`<timestamp>_custom_fields`): dos tablas nuevas y el
enum `CustomFieldMovementKind`. Compatible con el código anterior durante el deploy (nadie las lee).

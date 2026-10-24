# Tasks: Campos personalizados en los movimientos

**Input**: Design documents from `specs/036-custom-fields/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R14), data-model.md, contracts/api.md, quickstart.md

**Tests**: obligatorios (Constitución IV, TDD): en cada fase, los tests se escriben primero y deben
fallar antes de implementar. Correr solo los tests de lo tocado (nunca la suite completa por defecto).

**Organization**: por historia de usuario (spec.md US1–US6). Rutas relativas a la raíz del repo.
Abreviaturas: `API = apps/api`, `CF = apps/api/src/domains/custom-field`,
`TFV = apps/api/src/domains/transaction-field-value`, `TX = apps/api/src/domains/transaction`,
`WEB = apps/web/src`, `C = packages/contracts/src`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1…US6

---

## Phase 1: Setup

- [x] T001 Agregar a `API/prisma/schema.prisma` los enums `CustomFieldType`, `CustomFieldMovementKind`, los modelos `CustomField` (`@@map("custom-field")`) y `TransactionFieldValue` (`@@map("transaction-field-value")`) exactamente como data-model.md (UUID v7, `@@unique([userId, nameKey])`, `@@unique([transactionId, customFieldId])`, índices, FKs `onDelete: Cascade`) y las relaciones inversas en `User`, `Transaction`
- [x] T002 Generar la migración de expansión con `pnpm db:migrate` (nombre `custom_fields`) en `API/prisma/migrations/<ts>_custom_fields/migration.sql`, revisar el SQL y regenerar el cliente (`pnpm --filter @finance/api exec prisma generate`)
- [x] T003 [P] Crear el módulo de contrato vacío `C/custom-fields/index.ts` y exportarlo como `customFields` desde `C/index.ts`

---

## Phase 2: Foundational (bloquea todas las historias)

### Contrato y reglas puras

- [x] T004 [P] Tests de contrato en `C/custom-fields/custom-fields.test.ts`: `customFieldSchema`, `createCustomFieldSchema` (nombre 1–40, ≤ 50 opciones con labels únicos, scope con `rowId`), `customFieldValueSchema` por tipo, `normalizeFieldName` (minúsculas, sin tildes, espacios colapsados)
- [x] T005 Implementar en `C/custom-fields/index.ts`: tipos/schemas de contracts/api.md (`CustomField`, `CustomFieldScope`, `CustomFieldValue`, create/update, `assignmentTargetSchema`, `CUSTOM_FIELD_MAX_FIELDS=20`, `CUSTOM_FIELD_MAX_OPTIONS=50`, `CUSTOM_FIELD_ASSIGNMENT_MAX=5000`, `CUSTOM_FIELD_BULK_CONFIRM_THRESHOLD=20`) y `normalizeFieldName`
- [x] T006 [P] Tests unitarios del dominio en `API/test/unit/domains/custom-field/domain/custom-field.aggregate.spec.ts` y `.../domain/scope.spec.ts`: `parseValue` por tipo (válidos/inválidos, número ≤16 enteros ≤8 decimales, fecha `YYYY-MM-DD`, opción inexistente), `appliesTo` (cada dimensión, lado de traspaso = TRANSFER, sin tarjeta vs `cardKinds`, `restrictAccounts` vacío = nada), `showsFor`, bloqueo de tipo con `valueCount>0`, quitar opción en uso, default inválido
- [x] T007 Implementar `CF/domain/value.ts` (`parseValue`, `valueToDto`), `CF/domain/scope.ts` (`appliesTo`, `showsFor`, `MovementShape`), `CF/domain/custom-field.aggregate.ts` (create/applyUpdate con las invariantes de data-model.md) y `CF/domain/errors.ts` (`CUSTOM_FIELD_NOT_FOUND` 404, `_NAME_TAKEN` 409, `_LIMIT_REACHED` 409, `_TYPE_LOCKED` 409, `_OPTION_IN_USE` 409, `_INVALID_VALUE` 400, `_NOT_APPLICABLE` 400, `_ASSIGNMENT_TOO_LARGE` 400, `_FILTER_INVALID` 400)

### Puertos y adapters

- [x] T008 [P] Definir `CF/domain/ports/custom-field.repository.port.ts` y `TFV/domain/ports/transaction-field-value.repository.port.ts` con los métodos de data-model.md (§ Puertos) y sus tokens
- [x] T009 [P] Definir `TX/domain/ports/transaction-scope-lookup.port.ts` (`countInScope`, `idsInScope`, `idsForFilter`, `shapesFor`) y la función pura `TX/domain/scope-where.ts` (`scopeWhere(scope, cardIdsByKind)` → `TransactionWhereInput`-agnóstico: kinds/transferGroupId, cuentas, `cardId in`); test en `API/test/unit/domains/transaction/domain/scope-where.spec.ts`
- [x] T010 [P] Tests de integración `API/test/integration/domains/custom-field/infrastructure/prisma-custom-field.repository.spec.ts` (crear, unicidad de `nameKey`, `removeAccountFromScopesWithTx`, `clearAccountScopesWithTx`, aislamiento por usuario)
- [x] T011 [P] Tests de integración `API/test/integration/domains/transaction-field-value/infrastructure/prisma-transaction-field-value.repository.spec.ts` (upsert/delete por tipo, "sin valor" = sin fila, `idsMatching` exacto/texto/rango, `countByField`, `countByOption`, `listForTransactions`, borrar el movimiento o el campo borra sus valores por cascada, aislamiento)
- [x] T012 Implementar `CF/infrastructure/prisma-custom-field.repository.ts` + `CF/custom-field.data.module.ts` (hoja, sin imports de otros dominios)
- [x] T013 Implementar `TFV/infrastructure/prisma-transaction-field-value.repository.ts` (columnas tipadas; cualquier escritura manual pone `coveredByTransferGroupId`/`coverPreviousValue` en null) + `TFV/transaction-field-value.data.module.ts`
- [x] T014 Implementar `PrismaTransactionScopeLookupRepository` en `TX/infrastructure/prisma-transaction-scope-lookup.repository.ts`, bindearlo y exportarlo en `TX/transaction.data.module.ts`; test de integración en `API/test/integration/domains/transaction/infrastructure/transaction-scope-lookup.spec.ts`
- [x] T015 [P] Agregar `idsByKind(userId, kinds)` a `apps/api/src/domains/card-account/domain/ports/*` y su adapter Prisma, con test de integración en `API/test/integration/domains/card-account/`

### Lectura de valores en movimientos

- [x] T016 Ampliar `transactionSchema` en `C/transactions/index.ts` con `customFields?: Record<rowId, CustomFieldValue>` (opcional por compatibilidad de deploy) y su test
- [x] T017 Superponer valores por página en `TX/application/queries/list-transactions.handler.ts` y `get-transaction.handler.ts` (UNA llamada a `listForTransactions` por página, como el overlay de `paidStatementId`); importar `TransactionFieldValueDataModule` en `TX/transaction.module.ts`; test unitario del overlay en `API/test/unit/domains/transaction/application/`
- [x] T018 Registrar los módulos nuevos en `apps/api/src/app.module.ts` y correr `pnpm check:boundaries`
- [x] T019 [P] Agregar a `packages/i18n/src/{es,en}.json` los `errors.<CODE>` de T007 y la base `customFields.*` / `nav.customFields`; paridad con `packages/i18n/src/parity.test.ts`
- [x] T020 [P] Cliente web `WEB/domains/custom-fields/api/customFieldsApi.ts` (list/create/update/remove/scopeCount) y hook `WEB/domains/custom-fields/hooks/useCustomFields.ts` (query key `["custom-fields"]`)

**Checkpoint**: tablas, contrato, reglas, puertos y overlay listos; las historias pueden empezar.

---

## Phase 3: User Story 1 — Definir mis propios campos (P1) 🎯 MVP

**Goal**: crear, editar y eliminar campos propios desde la sección "Campos".
**Independent Test**: crear/editar/eliminar un campo de cada tipo; otro usuario no lo ve (US1 escenarios 1–4 y 6).

- [x] T021 [P] [US1] Tests unitarios de handlers en `API/test/unit/domains/custom-field/application/`: create (límite 20, nombre tomado, cuentas del alcance ajenas → `ACCOUNT_NOT_FOUND`, `applyDefaultToExisting` llama `idsInScope` + `upsertManyWithTx` en la misma tx), update (tipo bloqueado, opción en uso, opciones conservan id, cambiar el alcance no borra ni rellena valores), remove, list con `valueCount`/`scopeBroken`, scope-count
- [x] T022 [P] [US1] Tests e2e `API/test/e2e/domains/custom-field/custom-fields.http.spec.ts`: `GET/POST/PATCH/DELETE /custom-fields`, `POST /custom-fields/scope-count`, aislamiento (otro usuario 404), `INVALID_ID_FORMAT`
- [x] T023 [US1] Implementar commands/handlers `CF/application/commands/{create,update,remove}-custom-field.*` y queries `CF/application/queries/{list-custom-fields,count-scope}.*` (ownership de `scope.accountIds` vía `BankAccountLookupPort.accountOwned`; idempotencia R9)
- [x] T024 [US1] Implementar la Facade `CF/presentation/custom-fields.controller.ts` (rutas de contracts/api.md, `ZodValidationPipe`/`ZodParamsPipe`) y `CF/custom-field.module.ts` (importa solo hojas: custom-field, transaction-field-value, transaction, card-account, bank-account)
- [x] T025 [US1] Podar alcances al eliminar una cuenta: llamar `removeAccountFromScopesWithTx` en `apps/api/src/domains/bank-account/application/account-deletion.ts` (misma `$transaction`) e importar `CustomFieldDataModule` en `bank-account.module.ts`; y `clearAccountScopesWithTx` en `apps/api/src/domains/import/application/template-replacement.ts` (REPLACE); tests en sus suites existentes
- [x] T026 [P] [US1] Web: entrada "Campos" en `WEB/app/AppLayout.tsx` (grupo "Tu dinero", después de Importar, ícono `SlidersHorizontal`, en barra, riel y "Más") y ruta `/custom-fields` con `handle.title` en `WEB/app/router.tsx` + `lazyPages.ts`
- [x] T027 [P] [US1] Tests web `WEB/domains/custom-fields/components/CustomFieldFormPanel.test.tsx` y `WEB/domains/custom-fields/routes/CustomFieldsRoute.test.tsx` (crear sí/no con alcance y default, conteo "aplicar a N existentes", tipo bloqueado, borrar dice cuántos valores, campo con alcance roto señalado)
- [x] T028 [US1] Implementar `WEB/domains/custom-fields/routes/CustomFieldsRoute.tsx` (lista de campos, estados vacío/carga/error con el patrón de `states.tsx`), `components/CustomFieldFormPanel.tsx` (FormSurface panel: nombre, tipo, opciones, alcance con tipos/cuentas/clases de tarjeta, default, "mostrar como columna", "aplicar a N existentes" con `scopeCount`), `components/DeleteCustomFieldConfirm.tsx` (ConfirmModal con `valueCount`)
- [x] T029 [US1] Textos `customFields.*` (formulario, lista, confirmaciones, alcance roto) en `packages/i18n/src/{es,en}.json`

**Checkpoint**: US1 funciona sola.

---

## Phase 4: User Story 2 — Ver y editar el valor en cada movimiento (P1)

**Goal**: defaults al crear, edición en formulario y detalle, columna opcional.
**Independent Test**: US2 escenarios 1–5.

- [x] T030 [P] [US2] Tests unitarios `API/test/unit/domains/transaction/application/custom-field-values.spec.ts` (resolver defaults + explícitos según alcance; explícito fuera de alcance → `CUSTOM_FIELD_NOT_APPLICABLE`; `null` explícito = sin valor; lado de traspaso usa kind TRANSFER)
- [x] T031 [US2] Implementar `TX/application/custom-field-values.ts` (`resolveCreationValues(fields, shape, explicit)`) usando `parseValue`/`appliesTo` de `CF/domain`
- [x] T032 [US2] Ampliar `createTransactionSchema`/`createTransferSchema` en `C/transactions/index.ts` con `customFields` / `outgoingCustomFields` / `incomingCustomFields` (+ tests); `updateTransactionSchema` NO los acepta
- [x] T033 [US2] Escribir valores dentro de la `$transaction` existente en `TX/application/commands/create-transaction.handler.ts` y `create-transfer.handler.ts` (cargar campos con `CustomFieldRepositoryPort.listForUser` una vez; `upsertManyWithTx`); importar `CustomFieldDataModule` en `TX/transaction.module.ts`; la respuesta de crear incluye `customFields` escritos; tests e2e en `API/test/e2e/domains/transaction/transactions.http.spec.ts` y `transfers.http.spec.ts` (gasto con crédito nace "No", ingreso sin valor)
- [x] T034 [P] [US2] Tests unitarios + e2e de `PATCH /transactions/:id/custom-fields` en `API/test/unit/domains/custom-field/application/set-transaction-values.spec.ts` y `API/test/e2e/domains/custom-field/transaction-custom-fields.http.spec.ts` (movimiento de solo lectura editable — FR-012; no toca saldo/cupo; ajeno → 404; fuera de alcance sin valor previo → 400; con valor previo fuera de alcance se puede vaciar)
- [x] T035 [US2] Implementar `CF/application/commands/set-transaction-values.*` y la Facade `CF/presentation/transaction-custom-fields.controller.ts`
- [x] T036 [P] [US2] Tests web: `WEB/domains/custom-fields/components/CustomFieldInputs.test.tsx` (input por tipo, "sin valor" distinto de "No", solo campos que aplican o con valor) y ampliar `WEB/domains/transactions/components/TransactionFormPanel.test.tsx` / `TransactionDetailPanel.test.tsx`
- [x] T037 [US2] Implementar `WEB/domains/custom-fields/components/CustomFieldInputs.tsx` y `WEB/domains/custom-fields/lib/fieldApplies.ts` (espejo de `appliesTo`); integrarlos en `TransactionFormPanel.tsx` (defaults visibles antes de guardar, Duplicar copia valores, se envían en create) y en `TransactionDetailPanel.tsx` (edición con `PATCH …/custom-fields`, invalida `["transactions"]` y `["custom-fields"]`)
- [x] T038 [US2] Columnas dinámicas en `WEB/domains/transactions/components/TransactionTable.tsx` para campos con `showAsColumn` (tabla ancha: una columna por campo; lista compacta: "Nombre: valor" bajo la descripción) con test en `TransactionTable` existente o nuevo `TransactionTable.test.tsx`

**Checkpoint**: US1 + US2 funcionan.

---

## Phase 5: User Story 3 — Filtrar y sumar por un campo (P1)

**Goal**: filtro por valor en Movimientos y resumen por campo en "Campos".
**Independent Test**: US3 escenarios 1–4 y US1 escenario 5.

- [x] T039 [US3] Ampliar `transactionFiltersSchema` en `C/transactions/index.ts` con `cf`, `cfv`, `cfEmpty`, `cfText`, `cfMin`, `cfMax` (+ test: `cf` sin predicado → inválido) y el schema de respuesta de `summary/by-field`
- [x] T040 [P] [US3] Tests de integración `API/test/integration/domains/transaction/custom-field-filter.spec.ts`: lista y summary con `Transferido=No`/`Sí`/`sin valor` (este último solo dentro del alcance), combinado con mes, paginación keyset sin duplicados, totales sin flujos internos
- [x] T041 [US3] Hacer async `toListFilter` en `TX/application/queries/transaction-list-filter.ts` (resuelve el campo con `findOwned`, ids con `idsMatching`/`idsWithValue`, alcance con `scopeWhere` + `idsByKind`) y usarlo en `list-transactions.handler.ts` y `summarize-transactions.handler.ts`; ampliar `TransactionListFilter` (`ids`, `scope`) y `buildWhere` en `TX/infrastructure/prisma-transaction.repository.ts`
- [x] T042 [US3] Implementar `TX/application/queries/summarize-by-field.{query,handler}.ts` y la ruta `GET /transactions/summary/by-field/:fieldId` en `TX/presentation/transactions.controller.ts` (antes de `:id`); test e2e en `API/test/e2e/domains/transaction/summary-by-field.http.spec.ts`
- [x] T043 [P] [US3] Tests web: `WEB/domains/transactions/components/CustomFieldFilter.test.tsx` (control por tipo, estado en la URL `cf/cfv/…`) y ampliar `TransactionsRoute.test.tsx` (KPI y conteo con el filtro)
- [x] T044 [US3] Implementar `WEB/domains/transactions/components/CustomFieldFilter.tsx` dentro de `TransactionFiltersBar.tsx`, pasar los parámetros a `useInfiniteTransactions`/`useTransactionsSummary`
- [x] T045 [US3] Resumen por campo en `CustomFieldsRoute.tsx` (`useFieldSummary(fieldId)` → buckets; cada valor enlaza a `/transactions?cf=<id>&cfv=<valor>`; montos con `MaskedAmount`), test en `CustomFieldsRoute.test.tsx`

**Checkpoint**: el caso "¿cuánto me falta traspasar?" queda resuelto con US1–US3.

---

## Phase 6: User Story 4 — Marcar varios movimientos a la vez (P1)

**Goal**: asignación en bloque con confirmación (> 20) y deshacer.
**Independent Test**: US4 escenarios 1–4.

- [x] T046 [P] [US4] Tests unitarios `API/test/unit/domains/custom-field/application/{assign-values,preview-assignment,revert-assignment}.spec.ts` (fuera de alcance se omiten y se cuentan; tope 5.000; `previous` incluye "sin valor"; revert solo donde el valor actual = aplicado)
- [x] T047 [P] [US4] Tests e2e `API/test/e2e/domains/custom-field/assignments.http.spec.ts` (por ids y por filtro, replay con la misma `Idempotency-Key` devuelve la misma respuesta, revert respeta ediciones intermedias, ajenos no se tocan; SC-003: asignar 500 movimientos termina en < 5 s)
- [x] T048 [US4] Implementar `CF/application/queries/preview-assignment.*`, `CF/application/commands/assign-values.*` (extiende `BaseIdempotentCommandHandler`, operación `customField.assign`, resuelve target con `idsForFilter`/`shapesFor`) y `revert-assignment.*` (`revertIfUnchangedWithTx`); rutas en `custom-fields.controller.ts`; importar `IdempotencyRecordDataModule`
- [x] T049 [P] [US4] Tests web `WEB/domains/transactions/components/BulkAssignBar.test.tsx` y selección en `TransactionTable` (seleccionar filas, "todos los del filtro", confirmación > 20 con conteos, aviso con "Deshacer")
- [x] T050 [US4] Implementar modo selección en `WEB/domains/transactions/components/TransactionTable.tsx` + `TransactionsRoute.tsx` (casillas accesibles, "seleccionar todos los del filtro"), `components/BulkAssignBar.tsx` (campo + valor, preview, `ConfirmModal`, `useIdempotencyKey`, toast sonner con acción "Deshacer" 10 s) y textos `customFields.bulk.*` en `packages/i18n/src/{es,en}.json`

---

## Phase 7: User Story 5 — Importar y exportar con la plantilla (P1)

**Goal**: columnas por campo en la plantilla; valores importados y exportados.
**Independent Test**: US5 escenarios 1–4.

- [x] T051 [US5] Ampliar `C/imports/` (`importRowSchema`, filas de Movimientos/Traspasos en `templateImportRequestSchema`) con `customFields` (+ tests) y los códigos `IMPORT_CUSTOM_FIELD_INVALID` / `IMPORT_CUSTOM_FIELD_NOT_APPLICABLE` en `packages/i18n/src/{es,en}.json`
- [x] T052 [P] [US5] Tests unitarios en `API/test/unit/domains/import/domain/template-plan.spec.ts` e `import-plan.spec.ts`: valor inválido / fuera de alcance → problema con hoja y fila; celda vacía → default
- [x] T053 [US5] Validar y planificar valores en `apps/api/src/domains/import/domain/template-plan.ts` e `import-plan.ts` (con `parseValue`/`appliesTo`), y escribirlos tras crear los movimientos en `import/application/commands/import-template.handler.ts` e `import-transactions.handler.ts` (misma `$transaction`, defaults incluidos); `import.module.ts` importa las dos hojas; e2e en `API/test/e2e/domains/import/` (SC-004: 2.000 filas con un campo tardan ≤ 1,2× las mismas sin campos)
- [x] T054 [P] [US5] Tests web en `WEB/domains/import/lib/template.test.ts`: la plantilla trae una columna por campo (lista Sí/No y opciones, nota con tipo/alcance), ida y vuelta real exceljs → read-excel-file con valores, "tal vez" → problema, exportación con datos actuales trae valores
- [x] T055 [US5] Implementar columnas dinámicas en `WEB/domains/import/lib/templateSpec.ts`/`buildTemplate.ts` (al final de Movimientos; en Traspasos si el alcance incluye TRANSFER), lectura por nombre normalizado en `readTemplate.ts`, validación en `resolveTemplate.ts`, exportación en `templateData.ts` y `loadExistingData.ts`; pasar los campos del usuario a `buildTemplate` desde `DownloadTemplateDialog`

---

## Phase 8: User Story 6 — Transferir los pendientes en un paso (P2)

**Goal**: traspaso por la suma de los pendientes que los marca, revertido al borrar el traspaso.
**Independent Test**: US6 escenarios 1–5 y FR-025.

- [x] T056 [US6] Ampliar `C/transactions/index.ts` con `coverTransferSchema` / respuesta y `coveredCount` en el traspaso (+ tests)
- [x] T057 [US6] Extraer la escritura del par de `TX/application/commands/create-transfer.handler.ts` a `writeTransferPairWithTx` en `TX/application/transfer-legs.ts` sin cambiar comportamiento (sus tests existentes deben seguir verdes)
- [x] T058 [P] [US6] Tests unitarios `API/test/unit/domains/transaction/application/cover-with-transfer.spec.ts` (tipos/monedas mezclados, moneda ≠ cuentas, lados de traspaso, fuera de alcance, campo no sí/no, suma con `@finance/money`)
- [x] T059 [P] [US6] Tests de integración `API/test/integration/domains/transaction/cover-with-transfer.spec.ts`: todo-o-nada (prepago sin saldo → nada marcado), dos covers concurrentes con claves distintas sobre los mismos movimientos → uno gana y el otro `COVER_SELECTION_CHANGED`, `revertCoverWithTx` restaura el valor previo (incluido "sin valor") y respeta ediciones manuales
- [x] T060 [US6] Implementar `TX/application/commands/cover-with-transfer.{command,handler}.ts` (idempotente (c), operación `transaction.coverTransfer`; `lockForCoverWithTx` + `coverWithTx` en la misma `$transaction` que el par) y la ruta `POST /transactions/transfers/cover` (antes de `transfers/:groupId`)
- [x] T061 [US6] Revertir coberturas (FR-025) en la misma transacción en `TX/application/commands/remove-transfer.handler.ts`, `remove-transaction.handler.ts` (borrar un lado) y `apps/api/src/domains/bank-account/application/account-deletion.ts`; `coveredCount` en `get-transfer.handler.ts`; tests e2e en `API/test/e2e/domains/transaction/cover-transfer.http.spec.ts` (crear, replay misma clave = un traspaso, borrar → vuelven a "No")
- [x] T062 [P] [US6] Tests web `WEB/domains/transactions/components/CoverTransferPanel.test.tsx` (monto, cantidad y cuentas antes de confirmar; selección mezclada pide acotar; `Idempotency-Key`) y la confirmación de borrar traspaso con "N volverán a su valor anterior"
- [x] T063 [US6] Implementar `WEB/domains/transactions/components/CoverTransferPanel.tsx` (acción "Transferir pendientes" en `BulkAssignBar` cuando el filtro es de un campo sí/no), mensaje en `TransactionDeleteConfirm.tsx`, invalidar `accounts`/`transactions`/`custom-fields`; textos `customFields.cover.*` en `packages/i18n/src/{es,en}.json`

---

## Phase 9: Polish & Cross-Cutting

- [x] T064 [P] Registrar en `docs/PENDING.md` el límite del filtro por ids (R6) y lo diferido (campos en cuotas/deudas/recurrentes/metas, campos obligatorios, filtrar por varios campos a la vez, filtro por campo en la pestaña Movimientos del detalle de cuenta)
- [ ] T065 Recorrer `specs/036-custom-fields/quickstart.md` contra la API y la web locales y anotar el resultado — **pendiente**: los pasos de API quedaron cubiertos por los e2e; falta el recorrido en un navegador real
- [x] T066 Verificación: `pnpm typecheck`, `turbo run lint`, `pnpm format:check`, `pnpm check:boundaries`, `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`, y los tests acotados de quickstart.md
- [x] T067 Memoria: constitución (`.specify/memory/constitution.md`: dominios/tablas 32→34 en VI/VIII, bump de versión) y `CLAUDE.md` (bullets de `custom-field`/`transaction-field-value`, endpoints, filtro, sección "Campos", plantilla, estado del plan 036)

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → **Foundational (T004–T020)** → historias.
- **US1** depende solo de Foundational. **US2** depende de US1 (necesita crear campos para probar; el backend de US2 solo de Foundational). **US3** depende de US2 (valores existentes) para su prueba; su backend solo de Foundational. **US4** depende de US3 (filtro para "todos los del filtro"). **US5** depende de US2 (resolución de defaults, T031). **US6** depende de US3 + US4 (filtro y selección) y de T057.
- Dentro de cada historia: tests → dominio/aplicación → presentación → web.

```text
Setup → Foundational → US1 → US2 → US3 → US4 → US6
                                   └──→ US5
```

## Parallel Opportunities

- Foundational: T004/T006/T008/T009/T010/T011/T015/T019/T020 en paralelo; luego T012/T013/T014.
- US1: T021, T022, T026, T027 en paralelo; backend (T023–T025) y web (T028–T029) en paralelo entre sí.
- US2: T030, T034, T036 en paralelo.
- US5 puede avanzar en paralelo con US3/US4 una vez hecha T031.
- US6: T058, T059, T062 en paralelo tras T056–T057.

## Implementation Strategy

1. **MVP = Setup + Foundational + US1 + US2 + US3**: crear "Transferido", nacer en "No", filtrar y ver cuánto suma. Ya responde la pregunta del caso motivador.
2. **+ US4**: marcar en bloque tras traspasar a mano.
3. **+ US5**: migrar el historial de la planilla.
4. **+ US6 (P2)**: cerrar el ciclo en un paso.
5. Polish y memoria al final de cada entrega que se vaya a mergear.

## Notas de implementación (2026-10-24)

- T046 y T058 (unit de asignación en bloque y de "Transferir pendientes"): cubiertos a nivel e2e en
  `test/e2e/domains/custom-field/custom-fields.http.spec.ts` (replay idempotente, deshacer con edición
  intermedia, selección mezclada, dos covers concurrentes = un traspaso, 500 en < 5 s) en vez de
  archivos unitarios propios; el resolvedor de filtro y los valores de creación sí tienen unit.
- T059 (integración de cover): `prisma-transaction-field-value.repository.spec.ts` prueba lock,
  cobertura y reversión respetando ediciones; la concurrencia se prueba en el e2e.
- Los códigos `IMPORT_CUSTOM_FIELD_*` del plan no se crearon: la importación responde los códigos del
  dominio (`CUSTOM_FIELD_INVALID_VALUE`, `CUSTOM_FIELD_NOT_APPLICABLE`) con la fila en `field`.
- Agregado durante la implementación: el filtro `cfHasValue` (enlaza el resumen "con valor" de campos
  de texto, número y fecha), y escrituras en bloque en el adapter de valores (SC-004).

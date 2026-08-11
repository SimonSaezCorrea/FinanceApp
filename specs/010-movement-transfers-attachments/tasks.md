---
description: "Task list for 010 — Movimientos: traspasos, comprobantes y paneles rediseñados"
---

# Tasks: Movimientos — traspasos, comprobantes y paneles rediseñados

**Input**: Design documents from `/specs/010-movement-transfers-attachments/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED y obligatorios — Principio IV de la constitución (Test-First / TDD) es
NON-NEGOTIABLE. Cada tarea de lógica escribe su test antes que la implementación.

**Organization**: agrupadas por historia de usuario. US1 y US2 (P1) no dependen de US3 ni de US4;
US3 y US4 son independientes entre sí.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1 / US2 / US3 / US4

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencias y configuración que el resto necesita.

- [ ] T001 Añadir `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner` a `apps/api/package.json` y `@types/multer` como devDependency, y correr `pnpm install`
- [ ] T002 [P] Declarar las 6 variables S3 (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`) en `apps/api/.env.example`, todas opcionales y comentadas
- [ ] T003 [P] Registrar las variables S3 en el esquema de configuración de `apps/api/src/infra/config/` (todas opcionales, sin valores por defecto que finjan credenciales)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema, contratos y primitivos que TODAS las historias consumen. Nada de US1–US4
puede empezar antes de completar esta fase.

**⚠️ CRITICAL**: completar íntegra antes de Phase 3.

- [ ] T004 Añadir `transferGroupId String?` + `@@index([transferGroupId])` al modelo `Transaction` en `apps/api/prisma/schema.prisma`
- [ ] T005 Añadir el modelo `TransactionAttachment` (`@@map("transaction-attachment")`, campos y relaciones según data-model.md) a `apps/api/prisma/schema.prisma`, con la relación inversa en `Transaction` y en `User`
- [ ] T006 Ejecutar `pnpm db:push` y `pnpm --filter @finance/api exec prisma generate`, verificando que el cliente tipa `transferGroupId` y `transactionAttachment`
- [ ] T007 [P] Test de contrato para los shapes de traspaso en `packages/contracts/test/transactions.test.ts` (crear traspaso rechaza origen == destino; `isTransfer`/`transferSide` clasifican bien)
- [ ] T008 Añadir `transferGroupId` a `transactionSchema` y los shapes `createTransferSchema`/`updateTransferSchema`/`transferSchema` + helpers `isTransfer`/`transferSide` en `packages/contracts/src/transactions/index.ts`, según `contracts/transfers.md`
- [ ] T009 [P] Test de contrato de adjuntos en `packages/contracts/test/attachments.test.ts` (tipos admitidos, tamaño máximo)
- [ ] T010 [P] Crear `packages/contracts/src/transactions/attachments.ts` con `attachmentSchema`, `attachmentUrlSchema`, `ATTACHMENT_MAX_BYTES`, `ATTACHMENT_CONTENT_TYPES`, y exportarlo desde el índice del dominio
- [ ] T011 [P] Añadir las 7 claves de error nuevas (`TRANSFER_SAME_ACCOUNT`, `TRANSFER_TO_CREDIT_ACCOUNT`, `TRANSFER_ACCOUNT_NOT_FOUND`, `TRANSFER_NOT_FOUND`, `TRANSFER_EDIT_AS_PAIR`, `ATTACHMENT_TYPE_NOT_ALLOWED`, `ATTACHMENT_TOO_LARGE`, `ATTACHMENTS_UNAVAILABLE`, `ATTACHMENT_NOT_FOUND`) bajo `errors.*` en `apps/web/src/i18n/es.json` Y `en.json`
- [ ] T012 [P] Crear el primitivo `apps/web/src/shared/ui/detail-row.tsx` (fila etiqueta/valor: etiqueta a la izquierda, valor a la derecha, variante interactiva con chevron), con su test en `apps/web/src/shared/ui/detail-row.test.tsx`

**Checkpoint**: esquema, contratos, errores e i18n listos. US1–US4 pueden arrancar.

---

## Phase 3: User Story 1 — Leer un movimiento sin salir del listado (Priority: P1) 🎯 MVP

**Goal**: el panel de detalle rediseñado, con ‹ › paginada, duplicar y saldo tras el movimiento.

**Independent Test**: abrir un movimiento desde Movimientos y desde una cuenta, recorrer varios con
‹ ›, duplicar uno y comprobar que el formulario llega precargado con fecha de hoy.

- [ ] T013 [P] [US1] Test de `apps/web/src/domains/transactions/lib/balanceAfter.test.ts`: dado un saldo de cuenta y una lista ordenada de movimientos, el saldo tras el n-ésimo es correcto; devuelve `null` cuando el conjunto está filtrado por fecha o incompleto, y para cuentas sin saldo
- [ ] T014 [US1] Implementar `apps/web/src/domains/transactions/lib/balanceAfter.ts` con `@finance/money` (nunca `number`), aplicando la regla de visibilidad de research D6: se muestra solo si la cuenta lleva saldo, no hay filtro de fecha activo y el movimiento cae dentro de las páginas ya cargadas; si no, devuelve `null` y la fila se omite
- [ ] T015 [P] [US1] Test de `apps/web/src/domains/transactions/lib/panelNavigation.test.ts`: índice/total, deshabilitar en los extremos, y señalar "hay que cargar más" cuando se pide avanzar desde el último cargado con `hasNextPage`
- [ ] T016 [US1] Implementar el helper de navegación `apps/web/src/domains/transactions/lib/panelNavigation.ts` (puro, sin React), según research D5
- [ ] T017 [US1] Crear `apps/web/src/domains/transactions/components/TransactionDetailPanel.tsx`: contenido del detalle (ícono + descripción + fecha larga · categoría · cuenta, monto grande con signo y moneda, badges, filas con `DetailRow` de categoría / cuenta / tarjeta / saldo tras el movimiento) — sin overlay, testeable suelto
- [ ] T018 [US1] Añadir al panel el bloque de detalles opcionales: cuatro filas cuando hay datos, y una sola frase con acción "Agregar detalles" cuando los cuatro están vacíos (FR-003)
- [ ] T019 [US1] Reescribir `apps/web/src/domains/transactions/components/TransactionDetailModal.tsx` como cáscara `SidePanel` que renderiza `TransactionDetailPanel`, con cabecera de navegación (‹ › + "N de M") y pie Eliminar / Duplicar / Editar; Eliminar pasa por el `TransactionDeleteConfirm` existente (FR-006), nunca borra directo
- [ ] T020 [US1] Cablear en `apps/web/src/domains/transactions/routes/TransactionsRoute.tsx` los props nuevos del panel (items cargados, índice, `total` del summary, `hasNextPage`, `fetchNextPage`) y la acción Duplicar (abre el formulario en modo crear con los datos del movimiento y `occurredAt` = hoy)
- [ ] T021 [US1] Cablear lo mismo en la pestaña Movimientos de `apps/web/src/domains/accounts/routes/AccountDetailRoute.tsx`
- [ ] T022 [P] [US1] Añadir las claves i18n del detalle (`transactions.detail.*`: balanceAfter, duplicate, navPosition, noDetails, addDetails) en `es.json` Y `en.json`
- [ ] T023 [US1] Test de componente en `apps/web/src/domains/transactions/components/TransactionDetailPanel.test.tsx`: monto con signo y moneda, frase de detalles vacíos, fila de saldo omitida en cuenta sin saldo, ‹ › deshabilitados en los extremos

**Checkpoint**: US1 entregable por sí sola.

---

## Phase 4: User Story 2 — Registrar un movimiento en el formato nuevo (Priority: P1)

**Goal**: el formulario rediseñado, con saldo proyectado y "Guardar y crear otro".

**Independent Test**: crear un gasto y un ingreso desde el listado y desde una cuenta, usando
"Guardar y crear otro"; editar uno existente.

- [ ] T024 [P] [US2] Test de `apps/web/src/domains/transactions/lib/projectedBalance.test.ts`: saldo proyectado al crear (suma/resta según tipo) y al editar (revierte primero el delta original, incluido el cambio de cuenta); `null` para cuentas sin saldo
- [ ] T025 [US2] Implementar `apps/web/src/domains/transactions/lib/projectedBalance.ts` con `@finance/money`
- [ ] T026 [US2] Extraer el contenido del formulario a `apps/web/src/domains/transactions/components/TransactionFormPanel.tsx`: descripción como título editable, monto grande con signo y moneda, segmento de tipo, y filas `DetailRow` para fecha / categoría / cuenta / tarjeta / saldo proyectado
- [ ] T027 [US2] Reescribir `apps/web/src/domains/transactions/components/TransactionCreateModal.tsx` como cáscara `FormSurface` sobre `TransactionFormPanel`, agrupando los detalles opcionales aparte
- [ ] T028 [US2] Implementar "Guardar y crear otro" en el pie del formulario: guarda, limpia monto/descripción/categoría/detalles, conserva cuenta y fecha, mantiene el panel abierto y el foco en el monto; oculto en modo edición
- [ ] T029 [P] [US2] Añadir las claves i18n del formulario (`transactions.form.projectedBalance`, `transactions.form.saveAndNew`) en `es.json` Y `en.json`
- [ ] T030 [US2] Test de componente en `apps/web/src/domains/transactions/components/TransactionFormPanel.test.tsx`: elegir cuenta cambia la moneda y muestra el saldo proyectado; cambiar de gasto a ingreso invierte el signo; "Guardar y crear otro" no aparece al editar
- [ ] T030a [US2] Test de regresión de FR-011 en `apps/web/src/domains/transactions/components/TransactionFormPanel.rules.test.tsx`: gasto en cuenta `CREDIT_LINE` sin tarjeta no permite guardar y explica por qué; ingreso y cuenta `CASH` no ofrecen tarjeta; cuenta no cardable no muestra el campo — las reglas que el rediseño no debe romper

**Checkpoint**: US1 + US2 = el rediseño completo, sin capacidades nuevas de backend.

---

## Phase 5: User Story 3 — Traspasar dinero entre cuentas propias (Priority: P2)

**Goal**: traspaso como par de movimientos ligados, sin efecto en cupo ni en los agregados de
ingreso/gasto.

**Independent Test**: crear un traspaso, verificar ambos saldos y ambos listados, editarlo desde
cualquiera de sus lados (incluido cambiar a una tercera cuenta) y eliminarlo.

### Dominio y política

- [ ] T031 [P] [US3] Test unitario `apps/api/test/unit/domains/transaction/domain/transfer-policy.test.ts`: rechaza origen == destino, destino `CREDIT_LINE`, cuenta ajena, monto no positivo y cualquier `cardId`; acepta monedas distintas sin compararlas
- [ ] T032 [US3] Implementar `apps/api/src/domains/transaction/domain/transfer-policy.ts` y añadir los errores de traspaso a `apps/api/src/domains/transaction/domain/errors.ts`

### Persistencia

- [ ] T033 [US3] Extender `apps/api/src/domains/transaction/domain/ports/transaction.repository.port.ts` con `findTransferGroup`, `saveTransferPair`, `updateTransferPair` y `removeTransferPair` (cada uno recibiendo los `balanceDeltas` de las cuentas implicadas)
- [ ] T034 [US3] Implementar esos cuatro métodos en `apps/api/src/domains/transaction/infrastructure/prisma-transaction.repository.ts`, cada uno dentro de un único `prisma.$transaction` que escribe las dos filas y aplica los deltas vía `BankAccountRepositoryPort.incrementBalanceWithTx`
- [ ] T035 [US3] Test de integración `apps/api/test/integration/transaction/transfer-pair.repository.test.ts`: el par se crea atómicamente, un fallo a mitad no deja una fila suelta ni un saldo movido, y editar cambiando de cuenta ajusta los tres saldos

### Aplicación (CQRS)

- [ ] T036 [P] [US3] Tests unitarios de los handlers en `apps/api/test/unit/domains/transaction/application/transfer-handlers.test.ts` con puertos falsos (sin base de datos)
- [ ] T037 [US3] Implementar `create-transfer.command.ts` + `.handler.ts` en `apps/api/src/domains/transaction/application/commands/` (extiende `BaseCommandHandler`, valida con `TransferPolicy`, genera el `transferGroupId`, `creditStatementId` y `cardId` siempre `null`)
- [ ] T038 [US3] Implementar `update-transfer.command.ts` + `.handler.ts` (revierte los deltas anteriores y aplica los nuevos; permite cambiar cualquiera de las dos cuentas)
- [ ] T039 [US3] Implementar `remove-transfer.command.ts` + `.handler.ts` (borra el par y revierte ambos saldos)
- [ ] T040 [US3] Implementar `get-transfer.query.ts` + `.handler.ts` en `application/queries/`, devolviendo `{ transferGroupId, outgoing, incoming }`

### Exclusión de los agregados (FR-017 / SC-004) — crítico

- [ ] T041 [P] [US3] Test de integración `apps/api/test/integration/transaction/summary-excludes-transfers.test.ts`: registrar un traspaso NO cambia `currencyTotals` ni `categories` del resumen, pero SÍ suma 2 a `total`
- [ ] T042 [US3] Definir el predicado único `EXCLUDE_TRANSFERS` en `apps/api/src/domains/transaction/application/queries/transaction-list-filter.ts` y aplicarlo en `summary()` (`currencyTotals` y `categories`) dentro de `apps/api/src/domains/transaction/infrastructure/prisma-transaction.repository.ts`, con el comentario que explique por qué `total` no lo usa

### Presentación

- [ ] T043 [US3] Añadir a `apps/api/src/domains/transaction/presentation/transactions.controller.ts` las rutas `POST/GET/PATCH/DELETE /transactions/transfers[/:groupId]`, **declaradas antes de `:id`**, con `ZodValidationPipe` y `ZodParamsPipe`
- [ ] T044 [US3] Hacer que `DELETE /transactions/:id` sobre un lado de traspaso borre el par completo, y que `PATCH /transactions/:id` sobre un lado responda `409 TRANSFER_EDIT_AS_PAIR`
- [ ] T045 [US3] Registrar los nuevos handlers en `apps/api/src/domains/transaction/transaction.module.ts`
- [ ] T046 [US3] Test e2e `apps/api/test/e2e/transfers.e2e.test.ts`: crear → ver en ambas cuentas → editar cambiando el destino → borrar, afirmando saldos en cada paso; y los 5 rechazos de la política

### Frontend

- [ ] T047 [P] [US3] Añadir `transfer` a `apps/web/src/domains/transactions/api/transactionsApi.ts` y crear `apps/web/src/domains/transactions/hooks/useTransferMutations.ts` (invalidando cuentas, movimientos y summary)
- [ ] T048 [US3] Añadir el tercer segmento "Traspaso" y `apps/web/src/domains/transactions/components/TransferFields.tsx` (cuenta origen/destino con exclusión de la propia cuenta y de las `CREDIT_LINE`, monto de salida y de entrada); ocultar el campo de tarjeta al elegir traspaso
- [ ] T049 [US3] Al abrir a editar un movimiento con `transferGroupId`, cargar el par vía `GET /transactions/transfers/:groupId` y guardar por su endpoint (FR-015)
- [ ] T050 [P] [US3] Distintivo visual del traspaso en `apps/web/src/domains/transactions/components/TransactionTable.tsx` y en `TransactionDetailPanel.tsx`, indicando la cuenta del otro lado
- [ ] T051 [P] [US3] Excluir los traspasos de las métricas del panel en `apps/web/src/domains/dashboard/lib/metrics.ts`, con su test en `metrics.test.ts`
- [ ] T052 [P] [US3] Claves i18n de traspaso (`transactions.type.TRANSFER`, `transactions.form.fromAccount`, `toAccount`, `amountOut`, `amountIn`, `transactions.detail.transferCounterpart`) en `es.json` Y `en.json`

**Checkpoint**: traspasos completos de punta a punta.

---

## Phase 6: User Story 4 — Guardar el comprobante de un movimiento (Priority: P3)

**Goal**: adjuntos múltiples por movimiento sobre almacenamiento S3, inertes sin credenciales.

**Independent Test**: con bucket configurado, subir dos comprobantes, abrirlos y borrar uno; sin
configurar, comprobar que falla con mensaje claro.

### Dominio

- [ ] T053 [P] [US4] Test unitario `apps/api/test/unit/domains/transaction-attachment/attachment-policy.test.ts`: acepta los 4 tipos con sus magic bytes correctos, rechaza tipo no admitido, magic bytes que no coinciden con el tipo declarado, y > 5 MB
- [ ] T054 [US4] Crear `apps/api/src/domains/transaction-attachment/domain/`: `attachment.aggregate.ts`, `attachment-policy.ts` (incluida la comprobación de magic bytes), `errors.ts` y los puertos `attachment.repository.port.ts` y `object-storage.port.ts` (`put`/`getSignedUrl`/`delete`/`isConfigured`)

### Infraestructura

- [ ] T055 [US4] Implementar `apps/api/src/domains/transaction-attachment/infrastructure/prisma-attachment.repository.ts` (único adapter de la tabla, siempre scopeado por `userId`)
- [ ] T056 [US4] Implementar `apps/api/src/domains/transaction-attachment/infrastructure/s3-object-storage.adapter.ts`: cliente S3 con endpoint configurable, `isConfigured()` falso cuando faltan bucket o credenciales, URL prefirmada de 5 minutos, y clave `u/<userId>/t/<txId>/<id>-<slug>`
- [ ] T057 [US4] Crear `transaction-attachment.data.module.ts` (hoja: solo los bindings puerto→adapter) y `transaction-attachment.module.ts`, y registrarlo en `apps/api/src/app.module.ts`

### Aplicación y presentación

- [ ] T058 [P] [US4] Tests unitarios de handlers en `apps/api/test/unit/domains/transaction-attachment/handlers.test.ts` con un `ObjectStoragePort` falso en memoria (sin red): subir, listar, firmar URL, borrar, y el camino "sin configurar" → `ATTACHMENTS_UNAVAILABLE`
- [ ] T059 [US4] Implementar `upload-attachment` y `remove-attachment` (command + handler) en `application/commands/`; el borrado del objeto ocurre DESPUÉS de la transacción de base de datos y su fallo se registra sin revertir (research D4)
- [ ] T060 [US4] Implementar `list-attachments` y `get-attachment-url` (query + handler) en `application/queries/`
- [ ] T061 [US4] Crear `presentation/attachments.controller.ts` con las 4 rutas de `contracts/attachments.md`, usando `FileInterceptor` con `limits.fileSize` de 5 MB, almacenamiento en memoria y `fileFilter` por mimetype
- [ ] T062 [US4] Test e2e `apps/api/test/e2e/attachments.e2e.test.ts`: subir → listar → firmar → borrar; rechazo por tamaño, por tipo, por magic bytes; 404 con adjunto de otro usuario; y borrar el movimiento elimina sus adjuntos

### Frontend

- [ ] T063 [P] [US4] Crear `apps/web/src/domains/transactions/hooks/useAttachments.ts` (listar, subir con `FormData`, abrir por URL firmada, borrar) y sus llamadas en `transactionsApi.ts`
- [ ] T064 [US4] Crear `apps/web/src/domains/transactions/components/AttachmentsSection.tsx`: dropzone + selector de archivo, lista con nombre/tamaño/acciones, estado de subida, y mensaje de error mapeado por código
- [ ] T065 [US4] Insertar `AttachmentsSection` en `TransactionDetailPanel.tsx` y en `TransactionFormPanel.tsx`
- [ ] T065a [US4] Implementar la subida diferida (FR-021a) en `AttachmentsSection`: durante la creación los archivos elegidos se retienen en memoria (validados localmente por tipo y tamaño) y se suben en cuanto `POST /transactions` devuelve el id; cada pendiente muestra su progreso
- [ ] T065b [US4] Manejar el fallo de esa subida: el movimiento queda creado, el panel pasa a modo detalle y el adjunto se muestra en estado de error con botón **Reintentar** (nunca se pierde el archivo elegido sin avisar); test en `AttachmentsSection.deferred.test.tsx`
- [ ] T066 [P] [US4] Claves i18n de adjuntos (`transactions.attachments.*`: title, dropzone, browse, uploading, empty, delete, saveFirst) en `es.json` Y `en.json`
- [ ] T067 [US4] Test de componente `apps/web/src/domains/transactions/components/AttachmentsSection.test.tsx`: lista, rechazo local por tamaño/tipo antes de enviar, y mensaje de `ATTACHMENTS_UNAVAILABLE`

**Checkpoint**: las cuatro historias completas.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T067a [P] Test de paridad i18n en `apps/web/src/i18n/parity.test.ts`: los sets de claves de `es.json` y `en.json` son idénticos (cierra SC-007 con un mecanismo, no con disciplina)
- [ ] T068 [P] Catalogar en `docs/PENDING.md`: adjuntos inertes sin S3, y el "saldo tras el movimiento" omitido cuando el conjunto cargado no permite calcularlo
- [ ] T069 [P] Documentar la feature en `docs/english/ARCHITECTURE.md` y `docs/spanish/ARCHITECTURE.md` (dominio 22, columna `transferGroupId`, puerto de almacenamiento)
- [ ] T070 Actualizar `.specify/memory/constitution.md`: nueva dependencia (`@aws-sdk/*`), nuevas variables de entorno, dominio 22, y la regla de que un agregado de ingreso/gasto debe excluir traspasos; bump de versión + Sync Impact Report
- [ ] T071 Actualizar `CLAUDE.md`: dominio `transaction-attachment`, `transferGroupId` y su regla de exclusión, variables S3, y el estado del plan 010
- [ ] T072 Verificación responsive de ambos paneles en las etapas de `apps/web/breakpoints.ts` (teléfono / tablet / escritorio), sin `min-[NNNpx]:` ni queries inline
- [ ] T073 Puertas de calidad: `pnpm check:boundaries`, `pnpm typecheck`, los suites del alcance (`@finance/contracts`, `@finance/api`, web transactions) y `pnpm build`

---

## Dependencies

```text
Phase 1 (Setup) ──► Phase 2 (Foundational) ──┬──► Phase 3 (US1) ──► Phase 4 (US2)
                                              ├──► Phase 5 (US3)
                                              └──► Phase 6 (US4)
                                                       └──► Phase 7 (Polish)
```

- **US1 → US2**: US2 reutiliza `DetailRow` y el patrón de panel que US1 establece. Duplicar (T020)
  abre el formulario que exista en ese momento — el actual si US2 aún no se hizo —, así que US1 sigue
  siendo entregable por sí sola.
- **US3 y US4** son independientes entre sí y de US1/US2, salvo que T050/T065 tocan
  `TransactionDetailPanel.tsx`, creado en T017.
- T042 (exclusión en `summary`) es el que sostiene SC-004: no puede quedarse pendiente.

## Parallel opportunities

- Phase 2: T007+T009+T011+T012 en paralelo (archivos distintos).
- Phase 5: T031, T036, T041, T047, T051, T052 no comparten archivo.
- Phase 6: T053, T058, T063, T066 idem.
- Con dos personas: una toma US1+US2 (frontend puro) y la otra US3 (backend), tras Phase 2.

## Implementation strategy

1. **MVP = Phase 1 + 2 + 3 (US1)**: el panel de detalle rediseñado ya es entregable y visible.
2. **Incremento 2 = Phase 4 (US2)**: cierra el rediseño completo.
3. **Incremento 3 = Phase 5 (US3)**: traspasos.
4. **Incremento 4 = Phase 6 (US4)**: adjuntos (puede esperar a que exista el bucket).
5. **Phase 7** cierra memoria y puertas de calidad — obligatoria antes de dar la feature por hecha.

**Total**: 78 tareas — Setup 3, Foundational 9, US1 11, US2 8, US3 22, US4 17, Polish 7.
(Las cinco añadidas tras `/speckit-analyze`: T030a regresión de reglas de tarjeta, T065a/T065b
subida diferida con reintento, T067a paridad i18n; T014 y T019 se ampliaron en vez de duplicarse.)

---
description: "Task list for 013 — Vista Cuotas: rediseño funcional y pago real de la cuota"
---

# Tasks: Vista Cuotas — rediseño funcional y pago real de la cuota

**Input**: Design documents from `/specs/013-installments-redesign/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/installments.md](./contracts/installments.md),
[quickstart.md](./quickstart.md)

**Tests**: OBLIGATORIOS. La constitución del proyecto declara TDD como principio NO NEGOCIABLE
(§IV), así que cada unidad lleva su test **antes** que su implementación. No es una opción de esta
feature.

**Organization**: agrupadas por historia de usuario, en orden de prioridad. Cada fase de historia es
un incremento entregable y verificable por sí solo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: a qué historia pertenece (US1..US8)
- Toda tarea lleva su ruta de archivo exacta

## Path Conventions

Monorepo pnpm + Turborepo: `apps/api/src`, `apps/api/test`, `apps/web/src`, `packages/contracts/src`,
`packages/money/src`.

---

## Phase 1: Setup

- [x] T001 Añadir a `apps/api/prisma/schema.prisma` las 3 columnas de `InstallmentPayment` (`paidAmount Decimal? @db.Decimal(18,4)`, `carriedOverAmount Decimal @default(0) @db.Decimal(18,4)`, `transactionId String?`), su relación `transaction Transaction? @relation(fields:[transactionId], references:[id], onDelete: SetNull)` y el índice `@@index([transactionId])`, según [data-model.md](./data-model.md)
- [x] T002 Añadir a `apps/api/prisma/schema.prisma` las 2 columnas de `InstallmentPlan` (`category String?`, `paymentAccountId String?`), su relación `paymentAccount BankAccount? @relation("InstallmentPlanPaymentAccount", fields:[paymentAccountId], references:[id], onDelete: SetNull)`, el back-reference en `BankAccount` y el índice `@@index([paymentAccountId])`
- [x] T003 Añadir a `apps/api/prisma/schema.prisma` el back-reference `installmentPayments InstallmentPayment[]` en `Transaction` y ejecutar `pnpm db:push` + `pnpm --filter @finance/api exec prisma generate`

**Checkpoint**: el esquema compila y el cliente Prisma conoce las columnas nuevas.

---

## Phase 2: Foundational (BLOQUEANTE para todas las historias)

Contrato, puertos y aritmética pura. Nada de UI ni de endpoints todavía.

### Contrato compartido

- [x] T004 [P] Escribir en `packages/contracts/src/installments/installments.test.ts` los tests de `planStatus` (los 5 estados de FR-003, incluido `PARTIALLY_PAID`), `dueAmountOf` (FR-022) y `generatesMovementOnPay` (FR-035) — **antes** de implementarlos
- [x] T005 Extender `packages/contracts/src/installments/index.ts`: `installmentPaymentSchema` gana `paidAmount`, `carriedOverAmount`, `dueAmount`, `transactionId`; `installmentPlanSchema` gana `category`, `paymentAccountId`, `paidTotal`, `remainingAmount`, `nextDueDate`, `status`, `generatesMovementOnPay`, según [contracts/installments.md](./contracts/installments.md)
- [x] T006 Añadir a `packages/contracts/src/installments/index.ts` el enum `installmentPlanStatus` (5 valores) y las funciones `planStatus`, `dueAmountOf`, `generatesMovementOnPay` que hacen pasar T004
- [x] T007 Añadir a `packages/contracts/src/installments/index.ts` el `payInstallmentSchema` (`fromAccountId`, `amount`, `chargedAmount`, `paidAt`, todos nullables) y extender `createInstallmentPlanSchema`/`updateInstallmentPlanSchema` con `category` y `paymentAccountId`

### Aritmética del arrastre (el núcleo de la feature)

- [x] T008 [P] Escribir en `apps/api/test/unit/domains/installment-plan/installment-carry-over.spec.ts` los tests de la aritmética del arrastre: faltante simple, excedente simple, excedente que absorbe varias cuotas en cadena (FR-021a), arrastre encadenado sobre varias cuotas, cuota intermedia pagada saltada (FR-021c), y la invariante INV-C4 (pagado + adeudado = programado) verificada sobre una secuencia aleatoria de pagos
- [x] T009 Crear `apps/api/src/domains/installment-plan/domain/installment-carry-over.ts` con las funciones puras que hacen pasar T008, usando exclusivamente `@finance/money` (FR-021d, Constitución §I)

### Puertos

- [x] T010 [P] Añadir `deleteWithTx(tx, id)` a `apps/api/src/domains/transaction/domain/ports/transaction-writer.repository.port.ts` e implementarlo en `apps/api/src/domains/transaction/infrastructure/prisma-transaction.repository.ts`
- [x] T011 [P] Añadir a `TransactionPlan` (mismo puerto) el campo `installmentPlanId?: string | null` y propagarlo en el adapter
- [x] T012 [P] Exponer el `kind` de una tarjeta en el puerto de `card-account` (`kindForCard(userId, cardId)`) e implementarlo en su adapter, para que `installment-plan` pueda aplicar INV-P2 sin consultar tabla ajena (R7)
- [x] T013 [P] Crear `InstallmentPaymentLookupPort.isLinkedToPayment(userId, transactionId)` en `apps/api/src/domains/installment-payment/domain/ports/` e implementarlo en su adapter, para FR-028a
- [x] T014 Cablear los módulos: `installment-plan.module.ts` importa las hojas de datos de `transaction`, `bank-account` y `card-account`; `transaction.module.ts` importa la hoja de `installment-payment`. Verificar que el grafo sigue acíclico y que `pnpm check:boundaries` pasa

### Errores e i18n base

- [x] T015 [P] Añadir a `apps/api/src/domains/installment-plan/domain/errors.ts` los errores nuevos: `InstallmentPaymentAlreadyPaidError`, `InstallmentPaymentAccountRequiredError`, `InstallmentCardIsCreditError`, `InvalidPaymentAmountError`, `PaymentCurrencyAmbiguousError`, `PaymentExceedsRemainingError`, `InstallmentPaymentFromCreditAccountError`, con sus códigos y status según [contracts/installments.md](./contracts/installments.md)
- [x] T016 [P] Añadir las claves `errors.*` de T015 en `apps/web/src/i18n/es.json` y `en.json` (Constitución §III; `src/i18n/parity.test.ts` lo verifica)

**Checkpoint**: contrato publicado, arrastre probado y puertos listos. Ninguna historia puede empezar antes.

---

## Phase 3: User Story 1 — Ver mis planes de un vistazo (P1) 🎯 MVP

**Goal**: la lista pasa a ser una fila por plan, con los cuatro indicadores del encabezado.

**Independent Test**: con planes existentes, abrir Cuotas y comprobar que hay exactamente una fila
por plan, que progreso y restante cuadran con sus cuotas, y que los indicadores cuadran con la suma.

- [x] T017 [P] [US1] Escribir en `apps/api/test/unit/domains/installment-plan/plan-dto.spec.ts` los tests de los derivados del DTO: `paidTotal`, `remainingAmount`, `nextDueDate`, `status`, `generatesMovementOnPay`, incluidas las cuotas antiguas con `paidAmount = null` (R10)
- [x] T018 [US1] Implementar los derivados en el mapper de `apps/api/src/domains/installment-plan/application/` y exponerlos en las consultas `list-installment-plans.handler.ts` y `get-installment-plan.handler.ts`
- [x] T019 [P] [US1] Escribir en `apps/web/src/domains/installments/lib/installmentMetrics.test.ts` los tests de los cuatro indicadores agrupados por moneda: cuota del mes calendario incluyendo pagadas (FR-004a), pendiente total con arrastres (FR-004b), próxima cuota con estado, y planes activos contando el parcialmente pagado (FR-003)
- [x] T020 [US1] Reescribir `apps/web/src/domains/installments/lib/installmentMetrics.ts` con las funciones que hacen pasar T019, y borrar las que la vista aplanada ya no usa
- [x] T021 [US1] Mover `apps/web/src/domains/transactions/lib/categoryIcons.ts` → `apps/web/src/shared/lib/categoryIcons.ts` y `components/CategoryIcon.tsx` → `apps/web/src/shared/ui/category-icon.tsx`, con su test, y actualizar los imports de `domains/transactions` (R5)
- [x] T022 [US1] Reescribir `apps/web/src/domains/installments/components/InstallmentKpiStrip.tsx` con los cuatro indicadores por moneda (FR-004, FR-005a), destacando la próxima cuota vencida (FR-006)
- [x] T023 [P] [US1] Crear `apps/web/src/domains/installments/components/InstallmentPlanTable.tsx`: una fila por plan con ícono de categoría, rango de fechas, progreso n/N, estado de próxima cuota, monto de cuota, restante y tarjeta (FR-002, FR-002a), truncando títulos largos (FR-053a)
- [x] T024 [P] [US1] Crear `apps/web/src/domains/installments/components/InstallmentPlanList.tsx`: la variante de tarjetas apiladas para anchos reducidos, con los campos mínimos de FR-055a
- [x] T025 [US1] Reescribir `apps/web/src/domains/installments/routes/InstallmentsRoute.tsx`: orden por próxima cuota (FR-001a), filtros por estado de plan que se intersecan con el de 3 meses (FR-008, FR-008a, FR-009), conteo de planes visibles (FR-010), estados de carga/error/vacío (FR-058, FR-058a), y elección tabla↔tarjetas por `useElementWidth` (R9)
- [x] T026 [US1] Borrar los componentes de la vista aplanada que quedan sin uso: `InstallmentPaymentTable.tsx`, `InstallmentTable.tsx`, `InstallmentPlanCard.tsx`, y sus tests
- [x] T027 [P] [US1] Añadir en `apps/web/src/i18n/{es,en}.json` las claves de lista, indicadores, filtros y estados
- [x] T028 [US1] Actualizar `apps/web/src/domains/installments/routes/InstallmentsRoute.test.tsx` para la lista por plan

**Checkpoint**: la vista es usable y correcta de sólo lectura. Entregable por sí sola.

---

## Phase 4: User Story 2 — Abrir un plan sin perder la lista (P1)

**Goal**: el detalle es un panel lateral con el calendario completo de cuotas.

**Independent Test**: abrir un plan, comprobar que la lista de fondo no se reordena ni se comprime,
recorrer las cuotas, cerrar y verificar que la posición de scroll se conserva.

- [x] T029 [P] [US2] Escribir en `apps/web/src/domains/installments/components/InstallmentDetailPanel.test.tsx` los tests del panel: muestra pagado/restante/total, lista todas las cuotas con su estado, destaca la siguiente a pagar, y no ofrece acción de pago en un plan completado
- [x] T030 [US2] Crear `apps/web/src/domains/installments/components/InstallmentDetailPanel.tsx` sobre `shared/ui/detail-row.tsx` y `SidePanel`, con la lista de cuotas recorrible y la acción principal siempre visible (FR-013, FR-014, FR-058c)
- [x] T030a [US2] Añadir al pie de `InstallmentDetailPanel.tsx` las acciones de **editar** y eliminar el plan (FR-015), cableadas en US6 cuando exista el modo edición (T063) y la confirmación con impacto (T067)
- [x] T031 [US2] Conectar el panel en `InstallmentsRoute.tsx` sin que la lista se reordene ni cambie de ancho (FR-012), conservando el scroll, y **sin** navegación ‹ › (FR-011b)
- [x] T032 [US2] Verificar y ajustar la accesibilidad del panel: foco atrapado, Escape, foco devuelto a la fila de origen, nombre accesible (FR-011a)
- [x] T033 [P] [US2] Añadir en `apps/web/src/i18n/{es,en}.json` las claves del panel de detalle

**Checkpoint**: se puede consultar el calendario completo de cualquier plan.

---

## Phase 5: User Story 3 — Pagar una cuota y que el dinero se mueva (P1)

**Goal**: pagar registra un gasto real, mueve el saldo y arrastra el faltante; deshacer lo revierte.

**Independent Test**: pagar eligiendo cuenta, verificar el gasto y la bajada de saldo; deshacer y
verificar que ambos vuelven.

### Dominio (tests primero)

- [x] T034 [P] [US3] Escribir en `apps/api/test/unit/domains/installment-plan/pay-installment.test.ts` los tests del agregado: pago exacto, pago corto con arrastre, pago de más con absorción en cadena, pago sobre cuota ya pagada (INV-C3), monto cero o negativo (INV-C2), pago que excede lo adeudado por el plan (FR-021b), y faltante en la última cuota sin sucesora (FR-023)
- [x] T035 [US3] Implementar `payInstallment`/`unpayInstallment` en `apps/api/src/domains/installment-plan/domain/installment-plan.aggregate.ts` usando `installment-carry-over.ts`, hasta hacer pasar T034

### Aplicación y persistencia atómica

- [x] T036 [P] [US3] Escribir en `apps/api/test/integration/domains/installment-plan/pay-installment.integration.test.ts` los tests de atomicidad contra base real: pago que crea gasto + mueve saldo + marca cuota + arrastra, y **rollback** verificable cuando cualquiera de los pasos falla
- [x] T037 [US3] Reescribir `apps/api/src/domains/installment-plan/application/commands/pay-installment.{command,handler}.ts`: el comando acepta `fromAccountId`, `amount`, `chargedAmount`, `paidAt`; el handler sobreescribe `persist()` con un `prisma.$transaction` que crea el EXPENSE, descuenta el saldo, guarda la cuota y aplica el arrastre (FR-018, FR-019a), espejando `pay-credit-statement.handler.ts`
- [x] T037a [P] [US3] Escribir en `apps/api/test/unit/domains/installment-plan/pay-installment-currency.test.ts` los tests de la regla de doble moneda: cuando la moneda de la cuenta coincide con la del plan, `chargedAmount` se deriva de `amount`; cuando difieren, falta `chargedAmount` ⇒ `PAYMENT_CURRENCY_AMBIGUOUS` (FR-029), y el abono a la cuota se calcula con `amount` mientras el gasto se registra con `chargedAmount`
- [x] T037b [US3] Implementar esa regla en `apps/api/src/domains/installment-plan/application/commands/pay-installment.handler.ts`: el EXPENSE se crea con `chargedAmount` y la **moneda de la cuenta** (FR-030); el arrastre y `paidAmount` se calculan con `amount` en la **moneda del plan** (FR-031). Las dos cifras nunca se comparan ni se convierten
- [x] T038 [US3] Aplicar en el handler de pago las guardas de cuenta: `MovementPolicy.assertWithinPrepaidBalance` / `assertWithinOverdraft` (FR-026, FR-026a, R6) y el rechazo de cuenta de crédito como origen (FR-028b)
- [x] T039 [US3] Reescribir `apps/api/src/domains/installment-plan/application/commands/unpay-installment.handler.ts` con el `persist()` simétrico: borrar el gasto (`deleteWithTx`), restituir el saldo, limpiar `paidAt`/`paidAmount`/`transactionId` y revertir el arrastre que ese pago provocó — sin tocar el arrastre que la cuota **recibió** (FR-024)
- [x] T040 [US3] Actualizar `apps/api/src/domains/installment-plan/presentation/installments.controller.ts` para validar el cuerpo de pago con `payInstallmentSchema` vía `ZodValidationPipe`
- [x] T041 [P] [US3] Escribir en `apps/api/test/e2e/installments.e2e-spec.ts` el flujo HTTP completo de pagar y deshacer, incluidos los rechazos de T038 y la verificación de que el gasto creado aparece en `GET /transactions` de esa cuenta con su `installmentPlanId`, su categoría y su descripción — reconocible como movimiento de una cuota (FR-027)

### Bloqueo del movimiento vinculado

- [x] T042 [P] [US3] Escribir el test de que actualizar o eliminar un movimiento vinculado a una cuota responde `TRANSACTION_LINKED_TO_INSTALLMENT` (FR-028a)
- [x] T043 [US3] Aplicar la comprobación con `InstallmentPaymentLookupPort` en los handlers de actualizar y eliminar movimiento del dominio `transaction`

### Web

- [x] T044 [P] [US3] Escribir en `apps/web/src/domains/installments/components/PayInstallmentPanel.test.tsx` los tests del formulario: prellenado con lo adeudado (FR-016a), cuenta obligatoria cuando falta (FR-034), y el bloque de dos monedas cuando difieren (FR-029)
- [x] T045 [US3] Crear `apps/web/src/domains/installments/components/PayInstallmentPanel.tsx` sobre `FormSurface surface="panel"`, con cuenta, monto, fecha, el bloque de moneda distinta y el saldo de la cuenta antes/después
- [x] T046 [US3] Excluir del selector de cuenta de origen las cuentas de tarjeta de crédito (FR-028b)
- [x] T047 [US3] Añadir a `apps/web/src/domains/installments/hooks/useInstallmentMutations.ts` las mutaciones de pagar y deshacer, invalidando planes, cuentas y movimientos (los tres cambian)
- [x] T048 [US3] Conectar pago y deshacer en `InstallmentDetailPanel.tsx`, con estado en vuelo (FR-018a), panel que permanece abierto tras la acción (FR-014a) y aviso de resultado (FR-058b)
- [x] T049 [P] [US3] Añadir en `apps/web/src/i18n/{es,en}.json` las claves del formulario de pago y del arrastre

**Checkpoint**: el dinero se mueve de verdad. Es el cambio de fondo de la feature.

---

## Phase 6: User Story 4 — Un plan con tarjeta de crédito no se paga dos veces (P1)

**Goal**: en esos planes la cuota sólo se marca; nada de movimientos ni de saldos.

**Independent Test**: pagar todas las cuotas de un plan con tarjeta de crédito y comprobar cero
movimientos nuevos y cero variación de saldo.

- [x] T050 [P] [US4] Escribir los tests unitarios de que un plan con tarjeta CREDIT rechaza `paymentAccountId` (INV-P2) y de que su pago no produce movimiento ni delta de saldo
- [x] T051 [US4] Aplicar la regla en el agregado y en el handler de pago, resolviendo el `kind` con el puerto de T012 (FR-035, FR-037)
- [x] T052 [US4] Aplicar la regla en el frontend: `PayInstallmentPanel` no pide cuenta y el formulario de plan no ofrece cuenta de pago cuando la tarjeta es CREDIT (FR-037)
- [x] T053 [US4] Añadir en `InstallmentDetailPanel.tsx` la explicación de por qué no se genera movimiento (FR-036), con sus claves en `es.json` y `en.json`
- [x] T054 [P] [US4] Escribir el test de que un plan con tarjeta DEBIT o PREPAID **sí** genera el gasto (FR-038) — el caso que es fácil bloquear de más

**Checkpoint**: la contabilidad no cuenta la misma deuda dos veces.

---

## Phase 7: User Story 5 — Crear un plan sabiendo en qué me meto (P2)

**Goal**: panel lateral con previsualización en vivo que coincide con el servidor.

**Independent Test**: comparar la previsualización con el calendario guardado, cuota por cuota.

- [x] T055 [P] [US5] Escribir en `apps/web/src/domains/installments/lib/schedulePreview.test.ts` los tests de que la previsualización coincide **exactamente** con el calendario que genera el agregado, incluido el ajuste por redondeo de la última cuota y un caso con interés
- [x] T056 [US5] Crear `apps/web/src/domains/installments/lib/schedulePreview.ts` como envoltorio delgado de `equalPrincipalSchedule` de `@finance/money` — **sin reimplementar la fórmula** (R4, FR-042)
- [x] T057 [P] [US5] Crear `apps/web/src/domains/installments/components/SchedulePreview.tsx`: monto por cuota, primera y última fecha, total, ajuste de la última cuota (FR-040, FR-041), estado de datos insuficientes (FR-043) y aviso del cargo financiero cuando hay interés y tarjeta (FR-045)
- [x] T058 [US5] Crear `apps/web/src/domains/installments/components/InstallmentFormPanel.tsx` sobre `FormSurface surface="panel"` en modo creación, con todos los campos de FR-046 incluidos categoría (combobox compartido con movimientos), tarjeta, cuenta de pago y tasa de interés (FR-044)
- [x] T059 [US5] Aceptar `category` y `paymentAccountId` en el handler de creación y en el de actualización de `apps/api/src/domains/installment-plan/application/commands/`
- [x] T059a [P] [US5] Escribir en `apps/api/test/integration/domains/installment-plan/payment-account-change.integration.test.ts` el test de SC-007: cambiar `paymentAccountId` en un plan con pagos ya registrados no altera ningún gasto existente (cuenta, monto, fecha) ni ningún saldo — sólo cambia lo que prellena el siguiente pago
- [x] T060 [US5] Retirar `apps/web/src/domains/installments/components/InstallmentCreateModal.tsx` y sustituir sus usos por el panel
- [x] T061 [P] [US5] Añadir en `apps/web/src/i18n/{es,en}.json` las claves de creación y previsualización

**Checkpoint**: crear un plan deja de ser un salto al vacío.

---

## Phase 8: User Story 6 — Editar sin que desaparezcan los campos (P2)

**Goal**: lo inmutable se muestra con su razón y su salida.

**Independent Test**: abrir la edición de un plan con pagos y comprobar que monto, cuotas y primera
fecha se leen, no se editan, y llevan explicación y alternativa.

- [x] T062 [P] [US6] Crear `apps/web/src/domains/installments/components/ImmutableFieldsNotice.tsx`: monto total, nº de cuotas y primera cuota en sólo lectura, con la razón y la salida (FR-048)
- [x] T063 [US6] Añadir el modo edición a `InstallmentFormPanel.tsx` con los campos editables de FR-049 y el bloque de T062
- [x] T064 [P] [US6] Escribir el test de que eliminar un plan revierte gastos y saldos en una sola operación (FR-050a) y de que el impacto declarado coincide con lo que ocurre
- [x] T065 [US6] Reescribir `apps/api/src/domains/installment-plan/application/commands/remove-installment-plan.handler.ts` con `persist()` transaccional: borrar los gastos de las cuotas, restituir el saldo agregado por cuenta, borrar el cargo financiero y borrar el plan (FR-050a)
- [x] T066 [US6] Exponer `deletionImpact` (nº de movimientos y restituciones por cuenta) en la consulta de detalle, para que la confirmación pueda declararlo (FR-050b)
- [x] T067 [US6] Conectar la confirmación de borrado con el impacto declarado en `InstallmentDetailPanel.tsx` / `InstallmentFormPanel.tsx` (FR-050, FR-050b)
- [x] T068 [P] [US6] Añadir en `apps/web/src/i18n/{es,en}.json` las claves de edición, campos inmutables y confirmación de borrado con impacto

**Checkpoint**: editar y borrar dejan de ocultar información al usuario.

---

## Phase 9: User Story 7 — Reconocer cada plan por su categoría (P3)

**Goal**: el plan lleva categoría compartida con movimientos y de ella sale su ícono.

**Independent Test**: dos planes con categorías distintas muestran íconos distintos; un plan y un
movimiento de igual categoría muestran el mismo.

- [x] T069 [P] [US7] Escribir el test de que el ícono de un plan y el de un movimiento de la misma categoría son el mismo componente (SC-011), y que una categoría desconocida da el ícono neutro (FR-053)
- [x] T070 [US7] Usar `shared/ui/category-icon.tsx` (movido en T021) en `InstallmentPlanTable`, `InstallmentPlanList` e `InstallmentDetailPanel`
- [x] T071 [US7] Alimentar el combobox de categoría del formulario de plan con las mismas opciones que usa el de movimientos (FR-051)

**Checkpoint**: la lista se lee de un vistazo.

---

## Phase 10: User Story 8 — La misma vista en teléfono, tablet y escritorio (P2)

**Goal**: el ciclo completo es usable en los tres formatos.

**Independent Test**: recorrer ver → abrir → pagar → crear → editar a 1440, 834 y 390 px.

- [x] T072 [P] [US8] Verificar y ajustar que detalle, creación, edición y pago usan `SidePanel`/`FormSurface surface="panel"` y por tanto se vuelven pantalla completa bajo el umbral ya estipulado, con la acción principal fijada al pie (FR-054)
- [x] T073 [US8] Ajustar la acción principal de móvil para un plan sin nada que pagar (FR-054a)
- [x] T074 [US8] Verificar que la lista alterna tabla ↔ tarjetas por el ancho de su **propio contenedor** y no del viewport, y que no hay ninguna clase `min-[NNNpx]:` ni consulta de medios inventada (R9, FR-055)
- [x] T075 [US8] Comprobar en los tres anchos que no hay desplazamiento horizontal (FR-056), incluidos los casos de título largo y muchas monedas

**Checkpoint**: la feature está completa en todos los formatos.

---

## Phase 11: Polish & Cross-Cutting

- [x] T076 [P] Actualizar `apps/api/prisma/seed.ts` con los casos que exige [quickstart.md](./quickstart.md): plan con tarjeta de crédito, plan con cuenta de pago y pagos reales, plan con arrastre, plan completado y plan con cuota vencida
- [x] T077 [P] Verificar la paridad es/en con `pnpm --filter @finance/web test -- i18n` y corregir lo que falte
- [ ] T078 Recorrer los 13 escenarios manuales de [quickstart.md](./quickstart.md) y anotar los resultados
- [x] T079 [P] Actualizar `docs/{english,spanish}/BANKING_LOGIC.md` con el modelo de arrastre de cuotas y su relación con el de facturación
- [x] T080 [P] Anotar en `docs/PENDING.md` el hallazgo de R6: el pago de facturación no valida saldo prepago ni sobregiro, a diferencia del pago de cuota — dos caminos que deberían validar igual
- [x] T081 Actualizar `CLAUDE.md` (arquitectura, columnas nuevas, reglas de arrastre y de bloqueo) y `.specify/memory/constitution.md` (bump de versión) — Constitución §V, obligatorio
- [x] T082 Ejecutar las puertas del repositorio: `pnpm typecheck`, `pnpm check:boundaries`, `pnpm format:check`, `turbo run lint` y las suites de test acotadas a lo tocado

---

## Dependencies

```text
Phase 1 (Setup) ──► Phase 2 (Foundational) ──┬──► US1 (P1) ──► US2 (P1) ──► US3 (P1) ──► US4 (P1)
                                             │                                  │
                                             ├──► US5 (P2) ─────────────────────┤
                                             ├──► US6 (P2) ◄────────────────────┘
                                             ├──► US7 (P3)
                                             └──► US8 (P2) ◄── requiere US2, US3, US5, US6
                                                                        │
                                                                        ▼
                                                              Phase 11 (Polish)
```

**Dependencias reales, no de conveniencia**:

- **US2 → US1**: el panel se abre desde una fila; sin la lista nueva no hay desde dónde.
- **US3 → US2**: pagar se hace desde el panel de detalle.
- **US4 → US3**: es una excepción a la regla de pago; sin la regla no hay qué excepcionar.
- **US6 → US3**: el borrado con reversión necesita que existan pagos con gasto que revertir.
- **US7 → US1**: el ícono se muestra en la fila (T021, el movimiento del mapa, va en US1 porque la
  fila lo necesita desde el principio).
- **US8 → US2, US3, US5, US6**: verifica en tres anchos las superficies que esas historias crean.
- **US5** es independiente de US2/US3/US4 y puede ir en paralelo tras la Fase 2.

## Parallel Opportunities

- **Fase 2**: T004, T008, T010, T011, T012, T013, T015 y T016 tocan archivos distintos y pueden ir a
  la vez. T005–T007 dependen de T004; T009 de T008; T014 de T010–T013.
- **US1**: T017/T019 (tests) en paralelo; T023/T024 (tabla y tarjetas) en paralelo; T027 en paralelo
  con todo lo demás.
- **US3**: el bloque de dominio (T034–T035), el de bloqueo de movimiento (T042–T043) y el de web
  (T044–T045) avanzan en paralelo una vez cerrado T037.
- **Fase 11**: T076, T077, T079 y T080 son independientes entre sí.
- **Regla que no se puede paralelizar**: dentro de cada par, el test va **antes** que su
  implementación (Constitución §IV).

## Implementation Strategy

**MVP = Fase 1 + Fase 2 + US1.** Entrega la vista correcta de sólo lectura: una fila por plan, con
indicadores que cuadran. Es demostrable y útil sin que nada del pago exista todavía.

**Incremento 2 = US2 + US3 + US4.** Es donde está el valor real y también todo el riesgo: el dinero
se mueve. Las tres van juntas porque US4 sin US3 no significa nada, y US3 sin US4 introduce el doble
conteo que la feature venía a evitar. **No cerrar el incremento con US3 sola.**

**Incremento 3 = US5 + US6 + US7.** Creación, edición y reconocimiento visual. US6 arrastra el
borrado con reversión, que es la segunda operación destructiva de la feature y merece su propia
tanda de atención.

**Incremento 4 = US8 + Polish.** Verificación en los tres formatos y sincronización de memoria.

**Orden de riesgo, por si hay que recortar**: lo que NO se puede entregar a medias es el par
US3+US4 y el borrado con reversión de US6 (T064–T067). Todo lo demás degrada a algo peor pero
correcto; esos tres degradan a números equivocados en las cuentas del usuario.

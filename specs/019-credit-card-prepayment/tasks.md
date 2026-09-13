---
description: "Task list for Prepago de tarjeta de crédito (período abierto)"
---

# Tasks: Prepago de tarjeta de crédito (período abierto)

**Input**: Design documents from `/specs/019-credit-card-prepayment/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluidos — este repo mantiene `test:unit`/`test:integration`/`test:e2e` en 100% verde
en cada feature de dominio de dinero (ver historial de `specs/013-018`), y esta feature toca
invariantes del pool de crédito.

**Organization**: Por historia de usuario (spec.md): US1 (P1, incluye FR-012/013/014 — la
reversión es parte de lo que hace a un prepago "hecho", según la aclaración explícita del
usuario), US2 (P2), US3 (P1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencias)
- **[Story]**: US1 / US2 / US3

---

## Phase 1: Setup

**Purpose**: Columnas nuevas y contrato compartido — nada de esto es específico de una historia.

- [x] T001 Agregar `prepaidAmount Decimal @default(0) @db.Decimal(18,4)` a `model CreditStatement` en `apps/api/prisma/schema.prisma` (junto a `carriedOverAmount`, mismo estilo de comentario `///`)
- [x] T002 Agregar `prepaymentStatementId String?` (FK → `CreditStatement`, `onDelete: SetNull`, sin `@unique`) y `prepaymentAccountId String?` (plano) a `model Transaction` en `apps/api/prisma/schema.prisma`, junto a la relación inversa nueva en `CreditStatement` (`prepayments Transaction[] @relation("CreditStatementPrepayments")`)
- [x] T003 Ejecutar `pnpm db:push` y `pnpm --filter @finance/api exec prisma generate` para materializar las columnas nuevas (sin `prisma/migrations` en este repo — ver `CLAUDE.md`)
- [x] T004 [P] Agregar `prepaidAmount: moneyString` a `accounts.CreditStatement` (schema) y el nuevo `accounts.prepayCreditStatementSchema` (`{fromAccountId: rowId, amount: moneyString, paidAt?: isoDateString}`) en `packages/contracts/src/accounts/index.ts`
- [x] T005 [P] Agregar `prepaymentStatementId: rowId.nullable()` y `prepaymentAccountId: rowId.nullable()` a `transactions.transactionSchema`, y el caso `{ kind: "CREDIT_CARD_PREPAYMENT"; statementId: string; accountId: string }` a `TransactionSource` + su rama en `sourceOf()`, en `packages/contracts/src/transactions/index.ts`
- [x] T006 [P] Extender `packages/contracts/src/transactions/source.test.ts` con casos para `CREDIT_CARD_PREPAYMENT` (con y sin `financeCharge`/otros campos en `null`, para confirmar que no colisiona con `STATEMENT_PAYMENT`)

**Checkpoint**: `pnpm --filter @finance/contracts test` y `pnpm --filter @finance/api exec prisma generate` en verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: El acumulador `prepaidAmount` y su aritmética en el agregado — TODAS las historias
dependen de esto (US1 lo crea, US2 lo acumula, US3 lo lee al cerrar).

**⚠️ CRITICAL**: Ninguna historia puede empezar hasta que esta fase esté completa.

- [x] T007 Agregar `canPrepay(): boolean` a la interfaz `CreditStatementState` en `apps/api/src/domains/credit-statement/domain/states/credit-statement-state.ts`
- [x] T008 [P] Implementar `canPrepay()` → `true` en `apps/api/src/domains/credit-statement/domain/states/open-state.ts`
- [x] T009 [P] Implementar `canPrepay()` → `false` en `pending-state.ts`, `partially-paid-state.ts`, `paid-state.ts` (mismo directorio)
- [x] T010 Agregar `StatementNotOpenError` (código `STATEMENT_NOT_OPEN`) a `apps/api/src/domains/credit-statement/domain/errors.ts`
- [x] T011 En `apps/api/src/domains/credit-statement/domain/credit-statement.aggregate.ts`: agregar `prepaidAmount` a `CreditStatementProps` + getter `prepaidAmount`; cambiar `totalFor(linkedAmount, instalmentAmount)` para restar `prepaidAmount` (nunca negativo — clamp a `"0"`, mismo patrón que `remainingFor`); agregar `changePrepayment(grossTotal: string, oldContribution: string, newContribution: string): void` (valida `newContribution >= 0` vía `InvalidPaymentAmountError` reutilizado, y `prepaidAmount` resultante `<= grossTotal` vía `PaymentExceedsRemainingError` reutilizado; la llamada con `oldContribution === "0"` además exige `this.state.canPrepay()` → `StatementNotOpenError`)
- [x] T012 [P] [Tests] Unit tests de `totalFor()` (con/sin `prepaidAmount`, clamp a cero) y `changePrepayment()` (crear/editar/eliminar, gate de estado solo al crear, tope `grossTotal`) en `apps/api/test/unit/domains/credit-statement/credit-statement.aggregate.spec.ts`
- [x] T013 [P] [Tests] Unit test de `OpenState.canPrepay()` = true y las otras tres = false en `apps/api/test/unit/domains/credit-statement/states/*.spec.ts`
- [x] T014 En `apps/api/src/domains/credit-statement/infrastructure/prisma-credit-statement.repository.ts`: `rowToProps` lee `prepaidAmount`; `saveWithTx` persiste `prepaidAmount` (siempre — a diferencia de `amount`, que solo se escribe una vez liquidado, `prepaidAmount` es siempre un valor real, no derivado)
- [x] T015 En `apps/api/src/domains/credit-statement/application/statement-dto.mapper.ts`: exponer `prepaidAmount: statement.prepaidAmount` en el DTO devuelto por `toStatementDto`

**Checkpoint**: `pnpm --filter @finance/api test:unit` en verde con la nueva aritmética; nada more visible todavía (sin endpoint aún).

---

## Phase 3: User Story 1 - Abonar contra el período corriente antes de que cierre (Priority: P1) 🎯 MVP

**Goal**: Un usuario puede crear un prepago contra el período OPEN de su tarjeta de crédito, y el
movimiento que eso genera es un movimiento normal — editable/eliminable con reversión automática
(FR-012/FR-013), identificable en su detalle (FR-014).

**Independent Test**: Ver `quickstart.md` Escenarios 1, 4 y 5.

### Tests for User Story 1

- [x] T016 [P] [US1] Integration test: `PrepayOpenPeriodHandler` crea el `EXPENSE`, decrementa `creditUsed`, sube `prepaidAmount`, todo en una transacción — en `apps/api/test/integration/domains/credit-statement/prepay-open-period.handler.spec.ts`
- [x] T017 [P] [US1] Integration test: `PrepayOpenPeriodHandler` rechaza monto ≤ 0 (`INVALID_PAYMENT_AMOUNT`), monto > deuda actual (`PAYMENT_EXCEEDS_REMAINING`), origen = cuenta CREDIT_CARD o la misma cuenta (`INVALID_PAYMENT_SOURCE`), y un `statementId` que no es el período OPEN (`STATEMENT_NOT_OPEN`) — mismo archivo que T016
- [x] T018 [P] [US1] Integration test: reenviar la misma `Idempotency-Key` devuelve la misma respuesta sin duplicar el efecto (mismo patrón que el test de idempotencia ya existente para `.../pay`) — mismo archivo que T016
- [x] T019 [P] [US1] Integration test: editar el monto de un movimiento con `prepaymentStatementId` ajusta `prepaidAmount`/`creditUsed` por la diferencia; eliminarlo los revierte por completo — en `apps/api/test/integration/domains/transaction/update-transaction.prepayment.spec.ts` (nuevo) y `remove-transaction.prepayment.spec.ts` (nuevo)
- [x] T020 [P] [US1] Integration test: editar/eliminar un prepago cuyo período YA cerró (PENDING) recalcula el `amount` de esa facturación en la misma operación, sin llamar a `.../sync` — mismo archivo que T019
- [ ] T021 [P] [US1] e2e test: `POST /accounts/:id/credit-statements/:statementId/prepay` de punta a punta (headers, body, respuesta, `GET /accounts/:id` refleja el nuevo `creditUsed`) — en `apps/api/test/e2e/credit-statement/prepay.http.spec.ts`

### Implementation for User Story 1 — backend

- [x] T022 [US1] Crear `PrepayOpenPeriodCommand` en `apps/api/src/domains/credit-statement/application/commands/prepay-open-period.command.ts` (userId, accountId, statementId, fromAccountId, amount, idempotencyKey, paidAt?)
- [x] T023 [US1] Crear `PrepayOpenPeriodHandler` en `apps/api/src/domains/credit-statement/application/commands/prepay-open-period.handler.ts` (extiende `BaseIdempotentCommandHandler`, `operation = "creditStatement.prepay"`, mismo esqueleto que `pay-credit-statement.handler.ts`: `loadContext` calcula el breakdown (`sums.netForPeriod`/`plans.billedInstallmentsForStatement`) SIN el `CreditStatement` bloqueado todavía — eso es lo que hace T023a; valida que `statementId` sea el período OPEN de la cuenta; `handleIdempotent` llama `statement.changePrepayment(grossTotal, "0", amount)`, `account.adjustCreditUsed(-amount)`, y en un `prisma.$transaction` crea el `Transaction` [`prepaymentStatementId`, `prepaymentAccountId`, `creditStatementId: null`], decrementa el saldo de `fromAccount`, guarda `statement` y `account`, y llama `complete(tx, result)`)
- [x] T023a [US1] **(Hallazgo de `/speckit-analyze`, ver `research.md` R8 — CRÍTICO, no omitir)** Agregar `findByIdForUpdateWithTx` a `CreditStatementRepositoryPort` (`apps/api/src/domains/credit-statement/domain/ports/credit-statement.repository.port.ts`) e implementarlo en `prisma-credit-statement.repository.ts` (mismo patrón `SELECT ... FOR UPDATE` que `apps/api/src/domains/debt/infrastructure/prisma-debt.repository.ts`'s `findOneForUpdateWithTx`). Modificar `PrepayOpenPeriodHandler` (T023) para que RE-LEA el `CreditStatement` bloqueado con este método DENTRO del `prisma.$transaction`, justo antes de llamar `changePrepayment` — el breakdown/`grossTotal` calculado en `loadContext` sigue sirviendo (no cambia entre dos prepagos concurrentes), pero `prepaidAmount` y la validación del tope deben leerse y verificarse ya bajo el lock
- [x] T023b [P] [US1] [Tests] Test de concurrencia: N prepagos simultáneos sobre el mismo período (con `Idempotency-Key` distintas cada uno), cuya suma excede lo debido — verificar que se aceptan exactamente los que caben y el resto falla con `PAYMENT_EXCEEDS_REMAINING`, nunca más de los que el período soporta (mismo criterio que el test de concurrencia de `debt`'s `register-payment`, "6 concurrentes → exactamente 6") — en `apps/api/test/integration/domains/credit-statement/prepay-open-period.handler.spec.ts`
- [x] T024 [US1] Agregar `prepaymentStatementId?`/`prepaymentAccountId?` a `TransactionPlan` en `apps/api/src/domains/transaction/domain/ports/transaction-writer.repository.port.ts`, y escribirlos en `apps/api/src/domains/transaction/infrastructure/prisma-transaction-writer.repository.ts`'s `createWithTx`
- [x] T025 [US1] Exponer `prepaymentStatementId`/`prepaymentAccountId` en `apps/api/src/domains/transaction/domain/transaction.aggregate.ts` (snapshot/`toContract()`) y en la lectura de `apps/api/src/domains/transaction/infrastructure/prisma-transaction.repository.ts`
- [x] T026 [US1] Declarar `POST :id/credit-statements/:statementId/prepay` en `apps/api/src/domains/credit-statement/presentation/credit-statements.controller.ts` (mismo patrón que `payCreditStatement`: `ZodParamsPipe(statementParamsSchema)`, `ZodValidationPipe(accounts.prepayCreditStatementSchema)`, `requireIdempotencyKey`)
- [x] T027 [US1] Registrar `PrepayOpenPeriodHandler` en `apps/api/src/domains/credit-statement/credit-statement.module.ts`

### Implementation for User Story 1 — reversión (FR-012/FR-013)

- [x] T028 [P] [US1] En `apps/api/src/domains/transaction/application/commands/update-transaction.handler.ts`: cuando `current.snapshot().prepaymentStatementId !== null`, dentro del `prisma.$transaction`, leer el `CreditStatement` con `findByIdForUpdateWithTx` (T023a — mismo lock, misma razón: dos ediciones/creaciones concurrentes sobre el mismo período no deben pisarse) + la `BankAccount` CREDIT_CARD (`prepaymentAccountId`), recomputar `grossTotal` (mismo cómputo que `SyncStatementHandler.loadContext`), llamar `statement.changePrepayment(grossTotal, montoAnterior, montoNuevo)`, y si el período ya estaba liquidado (`paidAt !== null`) reconciliar vía `statement.syncAmount(statement.totalFor(...))` (mismo mecanismo que `.../sync`); envolver esto y el guardado normal del movimiento en un solo `prisma.$transaction` (documentar como excepción cross-agregado, mismo criterio que `PayCreditStatementHandler`)
- [x] T029 [P] [US1] Espejo de T028 en `apps/api/src/domains/transaction/application/commands/remove-transaction.handler.ts` (contribución nueva = `"0"`, mismo `findByIdForUpdateWithTx`)
- [x] T030 [US1] Confirmar que `TRANSACTION_LINKED_TO_INSTALLMENT` (y cualquier otro guard de "movimiento de solo lectura") NO se dispara para `prepaymentStatementId` — es intencionalmente editable/eliminable (a diferencia de una cuota de instalment)

### Implementation for User Story 1 — frontend

- [x] T031 [P] [US1] Agregar mutación `prepayCreditStatement` (mismo shape que `payCreditStatement`) en el hook de mutaciones de cuentas (`apps/web/src/domains/accounts/hooks/useAccounts.ts`) y su llamada API en `apps/web/src/domains/accounts/api/accountsApi.ts`
- [x] T032 [US1] En `apps/web/src/domains/transactions/components/TransactionFormPanel.tsx`: agregar `"PREPAY"` al union de `mode`; en `typeOptions`, cuando `isCreditLine`, ofrecer `"EXPENSE"` y `"PREPAY"` (nunca `"INCOME"`/`"TRANSFER"`, sin cambios ahí); cuando `mode === "PREPAY"`, renderizar selector de cuenta de origen + monto (mismo layout que `PayStatementPanel`'s bloque de monto) en vez de los campos de un gasto ordinario
- [x] T033 [US1] En `apps/web/src/domains/transactions/components/TransactionCreateModal.tsx`: cuando `form.mode === "PREPAY"`, hacer submit contra `prepayCreditStatement` (resolviendo el `statementId` del período OPEN de la cuenta elegida, vía la data de cuentas/estados de cuenta ya cargada) en vez de `create`/`update`
- [x] T034 [P] [US1] En `apps/web/src/domains/transactions/components/TransactionDetailPanel.tsx`: agregar el caso `CREDIT_CARD_PREPAYMENT` a la fila "Origen" (badge + link `to="/accounts/:accountId?tab=billing&statement=:statementId"`, mismo patrón que `STATEMENT_PAYMENT`)
- [x] T035 [P] [US1] Agregar claves i18n nuevas (`transactions.type.PREPAY` o equivalente, textos del panel de prepago, `transactions.source.CREDIT_CARD_PREPAYMENT`) en AMBOS `apps/web/src/i18n/es.json` y `en.json`
- [x] T036 [P] [US1] Test de componente: `TransactionFormPanel` muestra "Prepagar" solo para cuentas CREDIT_CARD y oculta "Ingreso"/"Traspaso" (extender el test existente del componente)

**Checkpoint**: Escenarios 1, 4 y 5 de `quickstart.md` pasan de punta a punta. Esto es el MVP demostrable.

---

## Phase 4: User Story 2 - Varios abonos dentro del mismo período (Priority: P2)

**Goal**: Confirmar que el acumulador y sus topes se comportan correctamente ante múltiples
prepagos sucesivos sobre el mismo período.

**Independent Test**: Ver `quickstart.md` Escenario 2.

### Tests for User Story 2

- [x] T037 [P] [US2] Integration test: dos prepagos sucesivos sobre el mismo período OPEN acumulan `prepaidAmount` correctamente y generan dos `Transaction` distintas — extender `prepay-open-period.handler.spec.ts`
- [x] T038 [P] [US2] Integration test: un tercer prepago que excede lo que queda (tras los dos anteriores) es rechazado (`PAYMENT_EXCEEDS_REMAINING`) — mismo archivo
- [x] T039 [P] [US2] e2e test: flujo completo de dos prepagos vía HTTP, cada uno con su propia `Idempotency-Key` — extender `prepay.http.spec.ts`

### Implementation for User Story 2

- [x] T040 [US2] En `TransactionFormPanel`'s bloque de prepago (frontend): mostrar "lo que ya se prepagó este período" y "lo que queda" (reutilizando `remainingAmount` del período OPEN, ya neto gracias a T011) para que un segundo abono no sea una sorpresa
- [x] T041 [US2] Verificar (con test si falta cobertura) que `GET /accounts/:id/credit-statements` refleja el acumulado correcto tras varios prepagos, sin caché obsoleta en el frontend (`useAccountMutations` invalida `["accounts"]`, `["transactions"]` y las facturaciones, mismo patrón que `payCreditStatement` ya sigue)

**Checkpoint**: Escenario 2 de `quickstart.md` pasa. Ningún cambio de US1 se rompió.

---

## Phase 5: User Story 3 - El cierre normal de facturación descuenta lo ya prepagado (Priority: P1)

**Goal**: Cuando el período con prepagos cierra por el ciclo normal, la facturación resultante ya
tiene la deuda neta — y pagarla no vuelve a descontar `creditUsed` por lo ya prepagado.

**Independent Test**: Ver `quickstart.md` Escenario 3.

### Tests for User Story 3

- [ ] T042 [P] [US3] Integration test: `GenerateStatementsHandler`/`closeIfDue` sobre un período con `prepaidAmount > 0` cierra con `amount` neto (gross − prepaidAmount) — en `apps/api/test/integration/domains/credit-statement/generate-statements.handler.spec.ts` (extender)
- [ ] T043 [P] [US3] Integration test: pagar esa facturación PENDING en su totalidad deja `creditUsed` en exactamente `0` (no queda remanente de lo prepagado) — extender `pay-credit-statement.handler.spec.ts`
- [ ] T044 [P] [US3] e2e test: Escenario 3 completo de `quickstart.md` (prepago → cierre → pago) — extender `apps/api/test/e2e/credit-statement/*.http.spec.ts`

### Implementation for User Story 3

- [x] T045 [US3] En `apps/web/src/domains/accounts/components/BillingSection.tsx`: el botón "Pagar" que hoy aparece sobre el período OPEN (`CurrentPeriodCard`, línea ~237) se reemplaza por el flujo de prepago (abre el mismo modo `TransactionFormPanel`/`TransactionCreateModal` en `mode: "PREPAY"`, o un panel dedicado si se prefiere reutilizar `PayStatementPanel` — decisión de implementación libre siempre que el usuario ya no pueda, desde ahí, LIQUIDAR el período abierto por accidente)
- [ ] T046 [US3] Confirmar que `SyncStatementHandler` (`.../sync`) sigue funcionando igual sobre un período con `prepaidAmount` — su `recomputedAmount` ya pasa por el `totalFor()` corregido (T011), así que no debería requerir cambio de código, solo un test que lo confirme (puede fusionarse con T042)

**Checkpoint**: Los tres escenarios end-to-end de `quickstart.md` pasan. Feature completa.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T047 [P] Ejecutar `quickstart.md` completo a mano (o vía los e2e ya escritos) contra una DB real
- [x] T048 [P] `pnpm --filter @finance/api test:unit`, `test:integration`, `test:e2e` y `pnpm --filter @finance/web test` en verde
- [ ] T049 [P] `pnpm typecheck`, `pnpm run lint`, `pnpm check:boundaries`, `pnpm format:check` en verde en ambos paquetes
- [ ] T050 Actualizar `CLAUDE.md`: mover la entrada "Current plan (019 — planned, not yet implemented)" a un bloque "Amendment"/entrada definitiva en la sección de `credit-statement`, con el resultado real de la implementación (igual que cada feature anterior deja su resumen final)
- [ ] T051 Actualizar `.specify/memory/constitution.md` si el gate adicional de "escritura cross-agregado documentada" (Constitution Check de `plan.md`) amerita quedar como precedente citable (igual que `PayCreditStatementHandler` ya lo es) — evaluar si basta con referenciar esta feature en vez de nueva prosa
- [ ] T052 Revisar `docs/PENDING.md` por si esta feature cierra o abre algún punto documentado ahí (p. ej. si el prepago revive alguna limitación conocida del pool de crédito)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — arranca de inmediato
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA las tres historias
- **US1 (Phase 3)**: depende de Foundational. Es el MVP.
- **US2 (Phase 4)**: depende de Foundational + US1 (reutiliza el endpoint/command de US1; no puede probarse "varios abonos" sin que exista "un abono")
- **US3 (Phase 5)**: depende de Foundational (T011 es lo único que necesita realmente); puede implementarse en paralelo a US2 una vez Foundational está listo, aunque conceptualmente se valida mejor después de US1
- **Polish (Phase 6)**: depende de las tres historias completas

### Parallel Opportunities

- T004-T006 (contrato) en paralelo entre sí y con T001-T002 (schema) — archivos distintos
- T008-T009 (estados) en paralelo — archivos distintos
- T012-T013 (tests unitarios de Foundational) en paralelo entre sí
- Todos los tests de US1 (T016-T021) pueden escribirse en paralelo antes de la implementación
- T031, T034, T035, T036 (frontend, archivos distintos) en paralelo
- Todo Phase 4 y Phase 5 pueden trabajarse en paralelo por dos personas distintas una vez Foundational está listo (ambas dependen de T011, ninguna de la otra)

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1)
2. **Parar y validar**: Escenarios 1, 4, 5 de `quickstart.md`
3. Esto ya es una feature demostrable: crear un prepago, verlo reflejado, corregirlo/borrarlo.

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → demo (MVP)
3. US2 → demo (varios abonos)
4. US3 → demo (el ciclo completo, cierre y pago netos)
5. Polish → feature cerrada, memoria del proyecto actualizada

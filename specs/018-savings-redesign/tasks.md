---
description: "Task list for feature 018-savings-redesign"
---

# Tasks: Rediseño de Ahorros con progreso real y dinero real

**Input**: Design documents from `specs/018-savings-redesign/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/savings.md, quickstart.md

**Tests**: incluidos — este repo corre `test:unit`/`test:integration`/`test:e2e` como gate en cada
feature de este calibre (013-017); se generan tareas de test específicas, no un bloque genérico.

**Organization**: por historia de usuario (US1-US4, prioridad del spec), precedidas por Setup y
Foundational (schema + contrato compartido, sin los cuales ninguna historia compila).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1 (crear/mantener meta) · US2 (ver progreso/ritmo/proyección) · US3 (aporte real) ·
  US4 (cerrar/reabrir con destino)

## Path Conventions

Monorepo existente — `apps/api/src/domains/{savings-goal,savings-entry,transaction,bank-account}`,
`apps/web/src/domains/savings`, `packages/contracts/src`. Ver `plan.md` §Project Structure para el
árbol completo.

---

## Phase 1: Setup

**Purpose**: preparar el terreno de schema/contrato antes de tocar dominio o UI.

- [x] T001 Agregar enum `SavingsGoalCloseDestination` y las 9 columnas nuevas
      (`SavingsGoal.notes/closedAt/closeDestination/closeAccountId/closeTransactionId/closeAmount/closeTargetGoalId`,
      `SavingsEntry.bankAccountId/transactionId`, `Transaction.savingsEntryId/savingsGoalId`) en
      `apps/api/prisma/schema.prisma`, con las relaciones inversas necesarias (`SavingsEntry.transactions`/
      `SavingsGoal.withdrawalTransactions` como arrays opcionales, `onDelete: SetNull` en las FKs
      reales) — ver `data-model.md` para la forma exacta de cada campo.
- [x] T002 Correr `pnpm --filter @finance/api exec prisma generate` y `pnpm db:push` para aplicar el
      schema (dev, sin migración formal).
- [x] T003 [P] Actualizar `apps/api/prisma/seed.ts`: agregar `bankAccountId` a los `SavingsEntry` ya
      sembrados (antes no lo tenían), y sembrar al menos una `SavingsGoal` YA CERRADA (con
      `closedAt`/`closeDestination: "FREE_SAVINGS"` y sus aportes intactos) para que el bloque de
      "Metas cerradas" tenga datos reales desde el primer `pnpm db:seed`.

**Checkpoint**: schema listo, seed corre sin errores (`pnpm db:reset`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: contrato compartido + puertos + módulos de los que TODAS las historias dependen.

**⚠️ CRITICAL**: ninguna historia compila sin este contrato.

- [x] T004 [P] Extender `packages/contracts/src/savings/index.ts`: `savingsGoalCloseDestination`,
      campos nuevos en `savingsGoalSchema` (`notes`, `closedAt`, `closeDestination`,
      `closeTargetGoalId`, `savedAmount`, `pace`), `notes` en `createSavingsGoalSchema`,
      `closeSavingsGoalSchema` (discriminated union), `bankAccountId` requerido en
      `createSavingsEntrySchema` + `bankAccountId` en `savingsEntrySchema`, `savingsSummarySchema` —
      forma exacta en `contracts/savings.md`.
- [x] T005 [P] Agregar `"savingsEntry.update"`, `"savingsEntry.remove"`, `"savingsGoal.close"`,
      `"savingsGoal.reopen"` a `IDEMPOTENT_OPERATIONS` en `packages/contracts/src/idempotency/index.ts`.
- [x] T006 [P] Extender `TransactionSource`/`transactions.sourceOf()` en
      `packages/contracts/src/transactions/index.ts` con los casos `SAVINGS`/`SAVINGS_WITHDRAWAL`
      (ver `contracts/savings.md` §6).
- [x] T007 [P] Extender `TransactionPlan` en
      `apps/api/src/domains/transaction/domain/ports/transaction-writer.repository.port.ts` con
      `savingsEntryId?: string | null` y `savingsGoalId?: string | null`, y propagarlos en
      `apps/api/src/domains/transaction/infrastructure/prisma-transaction-writer.repository.ts` (el
      `createWithTx` real debe escribir ambas columnas).
- [x] T008 Crear `apps/api/src/domains/savings-goal/savings-goal.data.module.ts` (leaf nuevo, exporta
      `SAVINGS_GOAL_REPOSITORY`) y actualizar `savings-goal.module.ts` para importarlo junto con
      `BankAccountDataModule` y `TransactionDataModule` (mismo patrón que `debt.module.ts:36-41`) —
      cierra el hallazgo de `research.md` §7.
- [x] T009 [P] Agregar `saveWithTx`/`findOneForUpdateWithTx`/`countEntries` a
      `SavingsGoalRepositoryPort` (`apps/api/src/domains/savings-goal/domain/ports/savings-goal.repository.port.ts`)
      e implementarlos en `prisma-savings-goal.repository.ts`.
- [x] T010 [P] Agregar `saveWithTx`/`removeWithTx`/`reassignGoalWithTx`/`sumsByGoal` a
      `SavingsEntryRepositoryPort` (`apps/api/src/domains/savings-entry/domain/ports/savings-entry.repository.port.ts`)
      e implementarlos en `prisma-savings-entry.repository.ts` (`sumsByGoal` debe devolver
      `{ total, last3MonthsTotal }` por meta en una sola query agregada — ver research.md §4 para la
      fórmula de `pace`).
- [x] T011 [P] Agregar los 9 errores nuevos (`SAVINGS_GOAL_NOT_CLOSEABLE`,
      `SAVINGS_GOAL_ALREADY_CLOSED`, `SAVINGS_GOAL_NOT_CLOSED`, `SAVINGS_GOAL_CURRENCY_LOCKED`,
      `SAVINGS_GOAL_CLOSED`, `SAVINGS_GOAL_TARGET_NOT_OPEN`,
      `SAVINGS_GOAL_TARGET_CURRENCY_MISMATCH`, `SAVINGS_ENTRY_CURRENCY_MISMATCH`,
      `SAVINGS_ENTRY_FROM_CREDIT_ACCOUNT`) repartidos entre
      `apps/api/src/domains/savings-goal/domain/errors.ts` y
      `apps/api/src/domains/savings-entry/domain/errors.ts` según a qué aggregate pertenecen.
- [x] T012 [P] Agregar las 9 claves `errors.SAVINGS_*` a `apps/web/src/i18n/es.json` y `en.json`.

**Checkpoint**: `pnpm --filter @finance/api exec tsc --noEmit` y `pnpm --filter @finance/contracts test`
pasan; ninguna historia todavía tiene comportamiento nuevo, pero el terreno compila.

---

## Phase 3: User Story 1 - Crear y mantener una meta de ahorro (Priority: P1)

**Goal**: crear una meta con nota/fecha límite opcional, editarla libremente salvo la moneda una vez
que tiene aportes, con identidad visual determinística.

**Independent Test**: crear una meta sin fecha límite, verificar que aparece en "En curso" con 0%,
editar su monto/plazo, y confirmar que intentar cambiar su moneda después de registrar un aporte (via
fixture/seed) se rechaza.

### Tests (US1)

- [x] T013 [P] [US1] Unit test de `SavingsGoal.applyUpdate` rechazando cambio de `currency` cuando
      `hasEntries` es true, en `apps/api/test/unit/domains/savings-goal/savings-goal.aggregate.test.ts`.
- [x] T014 [P] [US1] E2E test `PATCH /savings/goals/:id` con `currency` distinta tras un aporte →
      `409 SAVINGS_GOAL_CURRENCY_LOCKED`, en `apps/api/test/e2e/savings-goal.e2e-spec.ts`.

### Implementation (US1)

- [x] T015 [US1] `SavingsGoal.applyUpdate` en
      `apps/api/src/domains/savings-goal/domain/savings-goal.aggregate.ts`: aceptar `notes`; rechazar
      `currency` distinta cuando el handler le pasa `hasEntries: true`
      (`SavingsGoalCurrencyLockedError`).
- [x] T016 [US1] `UpdateSavingsGoalHandler` (`apps/api/src/domains/savings-goal/application/commands/update-savings-goal.handler.ts`):
      resolver `hasEntries` vía `SAVINGS_ENTRY_REPOSITORY.countEntries`/`SavingsGoalRepositoryPort.countEntries`
      antes de llamar `applyUpdate`.
- [x] T017 [US1] `CreateSavingsGoalHandler`: aceptar/persistir `notes`.
- [x] T018 [P] [US1] `apps/web/src/domains/savings/lib/goalVisual.ts` (nuevo): `goalVisual(goalId):
{ icon: LucideIcon, colorVar: string }` — hash estable del id sobre un set fijo de íconos/tokens (ver
      research.md §8).
- [x] T019 [P] [US1] `apps/web/src/domains/savings/api/savingsApi.ts`: agregar `notes` al body de
      `createGoal`/`updateGoal`.
- [x] T020 [US1] `apps/web/src/domains/savings/components/SavingsGoalFormPanel.tsx` (nuevo, sobre
      `shared/ui/overlay/form-surface.tsx` `surface="panel"`): título (input sin borde 28px), monto
      objetivo + sufijo moneda, switch "Con fecha límite" (`shared/ui/switch`) + fecha condicional,
      selector de moneda (deshabilitado si `savedAmount !== "0"`), nota (`textarea`), nota al pie
      condicional al switch — copy exacto del README §3.
- [x] T021 [US1] `apps/web/src/i18n/{es,en}.json`: claves `savings.form.*` (eyebrow, placeholders,
      notas al pie, toasts "Meta creada"/"Meta actualizada").
- [x] T022 [US1] `apps/web/src/domains/savings/routes/SavingsRoute.tsx`: reemplazar el listado plano
      actual por el encabezado (h1 + subtítulo + botones "Aporte libre"/"Nueva meta" — este último
      abre `SavingsGoalFormPanel`) y una lista mínima de metas (sin agrupación/progreso todavía —
      eso es US2) para que crear/editar sea demostrable de punta a punta.

**Checkpoint**: crear/editar una meta funciona end-to-end en la UI; moneda se bloquea con aportes.

---

## Phase 4: User Story 2 - Ver el progreso, ritmo y proyección de cada meta (Priority: P2)

**Goal**: cada meta muestra `savedAmount`/`pace` reales, agrupación En curso/Fuera de plazo/Cumplidas,
y un resumen consolidado con ahorro libre incluido.

**Independent Test**: con metas y aportes de ejemplo (seed), verificar que cada estado (cumplida,
vencida, no llega a tiempo, en ritmo, sin aportes) se calcula correctamente y que el resumen suma
bien metas abiertas + ahorro libre, excluyendo cerradas.

### Tests (US2)

- [x] T023 [P] [US2] Unit test de `sumsByGoal`/`pace` (ventana de 3 meses calendario, y el caso "meta
      más joven que 3 meses") en
      `apps/api/test/unit/domains/savings-entry/savings-pace.test.ts`.
- [ ] T024 [P] [US2] Integration test de `GET /savings/goals` devolviendo `savedAmount`/`pace`
      correctos contra Postgres real, en `apps/api/test/integration/domains/savings-goal.integration-spec.ts`.
- [ ] T025 [P] [US2] Integration test de `GET /savings/summary` (total, ahorro libre, ritmo
      combinado, falta por reunir — excluyendo metas cerradas), mismo archivo que T024 o uno nuevo
      `savings-summary.integration-spec.ts`.
- [x] T026 [P] [US2] Unit test de `apps/web/src/domains/savings/lib/savingsMetrics.ts` cubriendo las
      5 fórmulas de estado del README (cumplida/vencida/no-llega-a-tiempo/en-ritmo/sin-aportes) y la
      agrupación, en `apps/web/src/domains/savings/lib/savingsMetrics.test.ts`.

### Implementation (US2)

- [x] T027 [US2] `ListSavingsGoalsHandler`/`GetSavingsGoalHandler`
      (`apps/api/src/domains/savings-goal/application/queries/`): componer `savedAmount`/`pace` por
      meta vía `SavingsEntryRepositoryPort.sumsByGoal` en el DTO mapper (nuevo
      `savings-goal-dto.mapper.ts`, mismo patrón que `plan-dto.mapper.ts`).
- [x] T028 [US2] Nuevo `GetSavingsSummaryQuery`/Handler
      (`apps/api/src/domains/savings-goal/application/queries/get-savings-summary.{query,handler}.ts`):
      agrega `totalSaved`/`freeSavingsTotal`/`pace`/`missing` sobre TODAS las metas no cerradas +
      entries sin meta, en Postgres (no en memoria) — mismo espíritu que `GET /transactions/summary`.
- [x] T029 [US2] `GET /savings/summary` en `apps/api/src/domains/savings-goal/presentation/savings.controller.ts`
      (declarada antes de cualquier ruta `:id`).
- [x] T030 [P] [US2] `apps/web/src/domains/savings/lib/savingsMetrics.ts` (nuevo): `pct`, `left`,
      `eta`, `status` (cumplida/vencida/no-llega-a-tiempo/en-ritmo/sin-aportes), `needed`
      (redondeado a 10.000), `groupGoals` — traducción literal de las fórmulas del README §Modelo y
      fórmulas.
- [x] T031 [P] [US2] `apps/web/src/domains/savings/hooks/useSavings.ts`: agregar `useSavingsSummary()`
      (`useQuery` sobre `GET /savings/summary`).
- [x] T032 [US2] `apps/web/src/domains/savings/components/SavingsTotalCard.tsx` (nuevo): bloque
      superior (ahorrado/nota, 3 stats, barra apilada por meta + segmento "Ahorro libre", leyenda) —
      medidas del README §1b.
- [x] T033 [US2] `apps/web/src/domains/savings/components/SavingsGroupHeader.tsx` (nuevo): título +
      "{n} metas · {monto} acumulados".
- [x] T034 [US2] `apps/web/src/domains/savings/components/SavingsGoalRow.tsx` (nuevo): chip 34px,
      título+porcentaje, barra de progreso, línea de estado con ícono/color por estado (tabla del
      README §Estados de meta), montos a ancho fijo 128px — sin las acciones de cerrar (eso es US4,
      pero el botón "Registrar aporte"/"Editar" ya deben estar).
- [x] T035 [US2] `apps/web/src/domains/savings/components/FreeSavingsSection.tsx` (nuevo): card con
      borde discontinuo, total de ahorro libre, lista de sus aportes — usa datos ya disponibles desde
      `useSavingsEntries`/summary, sin depender de US3 para RENDERIZAR (solo para poder generar
      aportes libres, que es la siguiente historia).
- [x] T036 [US2] `apps/web/src/domains/savings/routes/SavingsRoute.tsx`: integrar `SavingsTotalCard`,
      los 3 grupos (`SavingsGroupHeader` + lista de `SavingsGoalRow`, ocultando grupos vacíos) y
      `FreeSavingsSection`.
- [x] T037 [US2] `apps/web/src/domains/savings/components/SavingsGoalDetailPanel.tsx` (nuevo, sobre
      `shared/ui/overlay/side-panel.tsx` + `shared/ui/detail-row.tsx`): identidad + línea de estado,
      barra + 3 stats (ahorrado/objetivo/falta), filas de detalle (plazo/ritmo/proyección/moneda),
      historial de aportes — footer con "Editar meta"/"Registrar aporte" (el botón de cerrar se añade
      en US4).
- [x] T038 [US2] `apps/web/src/i18n/{es,en}.json`: claves `savings.status.*`, `savings.groups.*`,
      `savings.total.*`, `savings.detail.*`.

**Checkpoint**: la vista principal y el detalle muestran progreso/estado/proyección reales, con datos
de seed; nada mueve dinero todavía (eso es US3).

---

## Phase 5: User Story 3 - Registrar un aporte real (Priority: P3)

**Goal**: un aporte (a una meta o libre) crea un `Transaction` real, descuenta el saldo de la cuenta
de origen, y editar/eliminar un aporte revierte/ajusta ese movimiento — todo protegido por
idempotencia.

**Independent Test**: registrar un aporte desde una cuenta con saldo, verificar que el saldo baja
exactamente lo aportado, editar el monto y verificar que el saldo refleja solo el nuevo valor,
eliminar y verificar que el saldo vuelve al original; repetir el mismo request con la misma
`Idempotency-Key` no duplica el descuento.

### Tests (US3)

- [x] T039 [P] [US3] Unit test de `SavingsEntry.assertEditable`/`assertDeletable` (sin meta cerrada
      = siempre editable) en `apps/api/test/unit/domains/savings-entry/savings-entry.aggregate.test.ts`.
- [x] T040 [P] [US3] Integration test: crear un aporte real decrementa el saldo de la cuenta y crea un
      `Transaction` con `savingsEntryId` — contra Postgres real, en
      `apps/api/test/integration/domains/savings-entry.integration-spec.ts`.
- [x] T041 [P] [US3] Integration test: editar el monto de un aporte ajusta el saldo exactamente
      (reversa el viejo, aplica el nuevo), mismo archivo que T040.
- [x] T042 [P] [US3] Integration test: eliminar un aporte restaura el saldo original y borra el
      `Transaction` vinculado, mismo archivo.
- [x] T043 [P] [US3] E2E test: `POST /savings/entries` sin `Idempotency-Key` → `400
IDEMPOTENCY_KEY_REQUIRED`; repetir la misma clave dos veces → un solo descuento de saldo, en
      `apps/api/test/e2e/savings-entry.e2e-spec.ts`.
- [x] T044 [P] [US3] E2E test: aporte desde cuenta `CREDIT_LINE` → `409
SAVINGS_ENTRY_FROM_CREDIT_ACCOUNT`; aporte con moneda distinta a la meta → `409
SAVINGS_ENTRY_CURRENCY_MISMATCH`, mismo archivo.

### Implementation (US3)

- [x] T045 [US3] `SavingsEntry.assertEditable()`/`assertDeletable()` en
      `apps/api/src/domains/savings-entry/domain/savings-entry.aggregate.ts` (por ahora siempre
      permiten — la meta-cerrada se conecta en US4; dejar el método listo evita tocar el aggregate de
      nuevo entonces).
- [x] T046 [US3] `CreateSavingsEntryHandler`
      (`apps/api/src/domains/savings-entry/application/commands/create-savings-entry.handler.ts`):
      extender `loadContext` para resolver+validar la `BankAccount` (ownership, no `CREDIT_LINE`,
      moneda) y, dentro de `handleIdempotent`, en la MISMA `$transaction`: `MovementPolicy.assertWithinPrepaidBalance/
assertWithinOverdraft/assertWithinCeiling`, generar `transactionId` con `generateRowId()`, crear el
      `Transaction` real (`EXPENSE`, `category: "Ahorro"`, `savingsEntryId`) vía
      `TransactionWriterRepositoryPort.createWithTx`, `BankAccountRepositoryPort.incrementBalanceWithTx`
      (delta negativo), y persistir la entry con `bankAccountId`/`transactionId` — mismo esqueleto que
      `register-debt-payment.handler.ts:92-141`.
- [x] T047 [US3] Convertir `UpdateSavingsEntryHandler`
      (`apps/api/src/domains/savings-entry/application/commands/update-savings-entry.handler.ts`) en
      `BaseIdempotentCommandHandler` (`operation: "savingsEntry.update"`): dentro de la transacción,
      revertir el `Transaction`/saldo anterior (por `entry.transactionId`) y aplicar el nuevo (nuevo
      `transactionId` si cambia monto/cuenta/moneda) antes de `complete()`.
- [x] T048 [US3] Convertir `RemoveSavingsEntryHandler`
      (`apps/api/src/domains/savings-entry/application/commands/remove-savings-entry.handler.ts`) en
      `BaseIdempotentCommandHandler` (`operation: "savingsEntry.remove"`): borrar el `Transaction`
      vinculado y revertir el saldo antes de `complete()` (mismo patrón que
      `undo-debt-payment.handler.ts:75-93`).
- [x] T049 [US3] `apps/api/src/domains/savings-goal/presentation/savings.controller.ts`: agregar
      `requireIdempotencyKey` a `PATCH /savings/entries/:id` y `DELETE /savings/entries/:id` (ya
      estaba en `POST`).
- [x] T050 [P] [US3] `apps/web/src/shared/lib/apiClient.ts`/`savingsApi.ts`: `createEntry`/`updateEntry`/
      `removeEntry` (nuevos los dos últimos) pasando `idempotencyKey` por intento (mismo patrón que
      cualquier otro form con `useIdempotencyKey`, ver `contracts/idempotency.md` de specs/015).
- [x] T051 [US3] `apps/web/src/domains/savings/components/SavingsEntryFormPanel.tsx` (nuevo, sobre
      `form-surface.tsx`): monto con "+" en verde, chips de destino (Ahorro libre + una por meta
      abierta), fecha, selector de cuenta de origen (`SearchableSelect` de `useAccounts`, filtrado a
      no-`CREDIT_LINE`), nota — copy exacto del README §4.
- [x] T052 [US3] `apps/web/src/domains/savings/routes/SavingsRoute.tsx`: conectar los botones
      "Aporte libre"/"Registrar aporte" (de la fila, del detalle, y del bloque de ahorro libre) a
      `SavingsEntryFormPanel`, con mutations de create/update/remove e invalidación de
      `["savings","goals"]`/`["savings","summary"]`/`["accounts"]`/`["transactions"]`.
- [x] T053 [US3] `apps/web/src/i18n/{es,en}.json`: claves `savings.entry.*` (eyebrow, chips, notas al
      pie, toast "Aporte registrado").

**Checkpoint**: aportar/editar/eliminar mueve dinero real de punta a punta, protegido contra
duplicados.

---

## Phase 6: User Story 4 - Cerrar una meta cumplida o vencida, y poder reabrirla (Priority: P4)

**Goal**: cerrar una meta cumplida/vencida con destino (retirar a cuenta = dinero real y reversible,
ahorro libre o traspaso = reasignación de datos), conservando el historial; reabrir revierte lo que
corresponda.

**Independent Test**: cerrar una meta cumplida con "retirar a cuenta", verificar que la cuenta recibe
el monto, la meta pasa a cerradas fuera de los totales, y reabrir revierte exactamente ese ingreso.

### Tests (US4)

- [x] T054 [P] [US4] Unit test de `SavingsGoal.close()` rechazando una meta "en curso"/"sin aportes"
      (`SAVINGS_GOAL_NOT_CLOSEABLE`) y una ya cerrada (`SAVINGS_GOAL_ALREADY_CLOSED`), en
      `apps/api/test/unit/domains/savings-goal/savings-goal.aggregate.test.ts`.
- [x] T055 [P] [US4] Unit test de `SavingsGoal.reopen()` devolviendo el payload de reversión solo
      cuando `closeDestination === "WITHDRAW_TO_ACCOUNT"`, y `null` en los otros dos destinos, mismo
      archivo.
- [x] T056 [P] [US4] Unit test de `SavingsEntry.assertEditable/assertDeletable` ahora rechazando
      cuando la meta está cerrada (`SAVINGS_GOAL_CLOSED`), en
      `apps/api/test/unit/domains/savings-entry/savings-entry.aggregate.test.ts`.
- [x] T057 [P] [US4] Integration test: cerrar con "retirar a cuenta" incrementa el saldo destino y
      crea un `Transaction` con `savingsGoalId`; reabrir lo revierte exactamente (saldo vuelve al
      valor previo, `Transaction` borrado); además, inmediatamente después de cerrar, `GET
/savings/entries?savingsGoalId=` sigue devolviendo el historial completo de aportes sin cambios
      (SC-005) — contra Postgres real, en
      `apps/api/test/integration/domains/savings-goal.integration-spec.ts`.
- [x] T058 [P] [US4] Integration test: cerrar con "traspaso a otra meta" reasigna `savingsGoalId` de
      todos los aportes y NO mueve ningún saldo; reabrir NO revierte la reasignación (documentado en
      Assumptions), mismo archivo.
- [x] T059 [P] [US4] E2E test: `POST /savings/goals/:id/close` con destino "traspaso" hacia una meta
      de otra moneda → `409 SAVINGS_GOAL_TARGET_CURRENCY_MISMATCH`; hacia una meta cerrada → `409
SAVINGS_GOAL_TARGET_NOT_OPEN`, en `apps/api/test/e2e/savings-goal.e2e-spec.ts`.
- [x] T060 [P] [US4] E2E test: `PATCH`/`DELETE /savings/entries/:id` sobre un aporte de una meta
      cerrada → `409 SAVINGS_GOAL_CLOSED`, mismo archivo.

### Implementation (US4)

- [x] T061 [US4] `SavingsGoal.close(destination, payload)`/`reopen()` en
      `apps/api/src/domains/savings-goal/domain/savings-goal.aggregate.ts` — mismo patrón
      `recordPayment`/`takePaymentRecord` que `Debt` (ver research.md §1), guardando
      `closeAccountId`/`closeTransactionId`/`closeAmount` solo para `WITHDRAW_TO_ACCOUNT` y
      `closeTargetGoalId` solo para `TRANSFER_TO_GOAL`.
- [x] T062 [US4] Conectar `SavingsEntry.assertEditable`/`assertDeletable` (de T045) a
      `SAVINGS_GOAL_CLOSED`: los handlers de update/remove de entry (T047/T048) deben cargar la meta
      de la entry (si tiene una) y pasarle `goalClosed: boolean` al aggregate antes de mutar.
- [x] T063 [US4] Nuevo `CloseSavingsGoalCommand`/`CloseSavingsGoalHandler`
      (`apps/api/src/domains/savings-goal/application/commands/close-savings-goal.{command,handler}.ts`,
      `BaseIdempotentCommandHandler`, `operation: "savingsGoal.close"`): `loadContext` valida estado
      cumplida/vencida (usando `savedAmount`/`pace`/`deadline` ya calculables) y, según destino: - `WITHDRAW_TO_ACCOUNT`: valida cuenta (ownership, no `CREDIT_LINE`, moneda), dentro de la
      transacción crea el `Transaction` real (`INCOME`, `category: "Ahorro"`, `savingsGoalId`),
      `incrementBalanceWithTx` (delta positivo), `goal.close(...)`, `saveWithTx`. - `FREE_SAVINGS`: `SavingsEntryRepositoryPort.reassignGoalWithTx(tx, goalId, null)`,
      `goal.close(...)`, `saveWithTx` — sin tocar ninguna cuenta. - `TRANSFER_TO_GOAL`: valida meta destino (abierta, misma moneda, distinta a la que se cierra —
      `findOneForUpdateWithTx` sobre AMBAS metas para evitar carreras), `reassignGoalWithTx(tx,
goalId, targetGoalId)`, `goal.close(...)`, `saveWithTx`.
- [x] T064 [US4] Nuevo `ReopenSavingsGoalCommand`/`ReopenSavingsGoalHandler`
      (`.../application/commands/reopen-savings-goal.{command,handler}.ts`,
      `operation: "savingsGoal.reopen"`): `goal.reopen()` → si devuelve payload, borrar el
      `Transaction` (`closeTransactionId`) y `incrementBalanceWithTx` con el delta opuesto sobre
      `closeAccountId`; `saveWithTx` en cualquier caso.
- [x] T065 [US4] `POST /savings/goals/:id/close` y `POST /savings/goals/:id/reopen` en
      `savings.controller.ts`, **antes** de cualquier ruta `:id` genérica, ambas con
      `requireIdempotencyKey`.
- [x] T066 [P] [US4] `apps/web/src/domains/savings/api/savingsApi.ts`: `closeGoal`/`reopenGoal`.
- [x] T067 [US4] `apps/web/src/domains/savings/components/SavingsGoalClosePanel.tsx` (nuevo, sobre
      `form-surface.tsx`, z-index elevado como el de aporte): resumen, caja de monto acumulado, las 3
      tarjetas de destino seleccionables (con el default según cumplida/vencida del README §5),
      selector de meta destino condicional, fecha de cierre — copy exacto del README.
- [x] T068 [US4] `apps/web/src/domains/savings/components/ClosedGoalsSection.tsx` (nuevo): franja
      colapsable + lista con `line-through`, "Cerrada el {fecha} · {destino}", botón "Reabrir".
- [x] T069 [US4] `apps/web/src/domains/savings/components/SavingsGoalRow.tsx`: agregar los
      icon-buttons `archive`/`circle-x` (solo si cumplida/vencida) que abren `SavingsGoalClosePanel`
      con `stopPropagation`.
- [x] T070 [US4] `apps/web/src/domains/savings/components/SavingsGoalDetailPanel.tsx`: agregar el
      botón de cerrar en el footer (solo si cumplida/vencida).
- [x] T071 [US4] `apps/web/src/domains/savings/routes/SavingsRoute.tsx`: integrar
      `ClosedGoalsSection`, `SavingsGoalClosePanel`, el flujo de "Reabrir" (toast
      `"{meta} reabierta"`), y excluir las metas cerradas de `SavingsTotalCard`/grupos (ya deberían
      venir excluidas del backend, pero el filtro cliente `isError ? [] : data` sigue aplicando).
- [x] T072 [US4] `apps/web/src/i18n/{es,en}.json`: claves `savings.close.*`, `savings.closed.*`,
      toasts `"{meta} cerrada"`/`"{meta} reabierta"`.

**Checkpoint**: las 4 historias funcionan de punta a punta — este es el estado "feature completa".

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T073 [P] Actualizar `apps/web/src/domains/savings/routes/SavingsRoute.test.tsx` (existente,
      quedó obsoleto por el rediseño) para cubrir el nuevo flujo de alto nivel (agrupación, resumen,
      apertura de paneles).
- [x] T074 Correr `pnpm --filter @finance/api test:unit`, `test:integration`, `test:e2e`,
      `pnpm --filter @finance/web test`, `pnpm typecheck`, `pnpm run lint`, `pnpm check:boundaries`,
      `pnpm run format:check` — corregir lo que falle.
- [ ] T075 Ejecutar manualmente los 4 escenarios de `quickstart.md` contra `pnpm dev`.
- [x] T076 Actualizar `CLAUDE.md`: reemplazar el bloque "Current plan" del `SPECKIT START/END` por la
      entrada final "Prior plan: specs/018-savings-redesign/plan.md (… Estado: 018 implementado …)"
      con el resumen real de lo construido (mismo estilo que las entradas de 013-017), y agregar un
      bullet nuevo bajo `savings-goal`/`savings-entry` en la sección de dominios describiendo el
      modelo de cierre reversible y el movimiento de dinero real.
- [x] T077 Revisar si `.specify/memory/constitution.md` necesita una nota nueva — probablemente NO
      (esta feature aplica principios existentes, no introduce ninguno), pero confirmarlo
      explícitamente antes de cerrar el ciclo (Golden Rule 3 del skill `/sdd`).

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → sin dependencias.
- **Foundational (Phase 2)** → depende de Setup; BLOQUEA las 4 historias.
- **US1 (Phase 3)** → depende solo de Foundational. Independiente de US2/US3/US4.
- **US2 (Phase 4)** → depende de Foundational; usa el `SavingsGoalRow`/`SavingsGoalDetailPanel` que
  US1 no crea pero SÍ los consume después (T034/T037 son de US2, no de US1) — no depende del código
  de US1 para compilar, pero comparte `SavingsRoute.tsx` (edición secuencial del mismo archivo).
- **US3 (Phase 5)** → depende de Foundational. Su backend es independiente de US1/US2; su frontend
  reutiliza `SavingsGoalRow`/`SavingsGoalDetailPanel` de US2 para los botones de "Registrar aporte".
- **US4 (Phase 6)** → depende de Foundational Y de US3 (reutiliza el mecanismo real de movimiento de
  dinero para el destino "retirar a cuenta") Y de US2 (reutiliza `savedAmount`/`pace`/agrupación para
  decidir si una meta es cerrable). Es, por diseño, la última historia — igual que en la priorización
  del spec.
- **Polish (Phase 7)** → depende de las 4 historias.

### Parallel Opportunities

- Dentro de Foundational: T004-T012 son todos `[P]` salvo T008 (que otros importan) — hacer T008
  antes o en paralelo cuidando el orden de merge del módulo Nest.
- Dentro de cada historia, todas las tareas de test marcadas `[P]` corren en paralelo entre sí (son
  archivos nuevos independientes); los `[P]` de componentes nuevos de frontend igual, mientras no
  toquen `SavingsRoute.tsx` en el mismo momento.
- US1 y US2 backend (T015-T017 vs T027-T029) pueden avanzar en paralelo por dos personas — ambos
  dependen solo de Foundational, no entre sí.

---

## Implementation Strategy

### MVP First

1. Setup + Foundational (T001-T012).
2. US1 (T013-T022) — ya es demostrable: crear/editar una meta con identidad visual.
3. **STOP y VALIDAR** con el Escenario 1 de `quickstart.md`.

### Incremental Delivery

1. Foundation lista → US1 (crear/editar meta) → demo.
2. - US2 (progreso/estado/proyección/resumen) → demo — ya se ve la app "de verdad" aunque el dinero
     siga sin moverse (se puede simular con datos de seed).
3. - US3 (aporte real) → demo — el dinero ya se mueve de verdad.
4. - US4 (cerrar/reabrir) → demo — feature completa, cierra el ciclo de vida.
5. Polish → gates verdes, docs sincronizadas.

---

## Notes

- Cada tarea de dominio backend que "convierte un handler en `BaseIdempotentCommandHandler`"
  (T047/T048/T063/T064) implica también registrar el nuevo `operation` en el constructor
  (`super(eventBus, records)`) y ajustar el `presentation/savings.controller.ts` para leer y pasar
  `Idempotency-Key` — no son cambios aislados al archivo del handler.
- Ningún task de esta lista requiere una migración formal de Prisma — todo pasa por `db push` +
  regenerar el seed (T002/T003), siguiendo la convención ya establecida por specs/013-017.
- Commitear al cerrar cada checkpoint de historia (o antes, por lotes lógicos de Foundational), no
  task por task — mismo criterio que specs anteriores.

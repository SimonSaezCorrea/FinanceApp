---
description: "Task list for Personalización financiera del perfil"
---

# Tasks: Personalización financiera del perfil

**Input**: Design documents from `/specs/020-profile-financial-settings/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/preferences-and-currency.md, quickstart.md

**Tests**: Incluidos — el repo mantiene cobertura unit/integration/e2e en `apps/api` y Vitest+Testing
Library en `apps/web` para toda feature (ver `CLAUDE.md` y specs anteriores); se generan tareas de
test junto a cada tarea de implementación relevante, no un bloque TDD separado al inicio.

**Organization**: Las tareas están agrupadas por historia de usuario (US1/US2/US3 del spec), para
poder implementar y validar cada una de forma independiente.

**Nota de revisión**: Esta versión incorpora los hallazgos de `/speckit-analyze` (2026-09-18):
T002-T003 (C1, CRITICAL — dos leaves de datos que el plan original daba por existentes no existen),
T041-T043 (C2, HIGH — tres widgets del Panel que mostraban dinero sin enmascarar quedaban fuera de
Phase 4), y T029 (U1, MEDIUM — test de regresión para FR-008 que faltaba). Los hallazgos F1 y U2 se
resolvieron directamente en `spec.md`/`research.md`, no requieren tarea nueva aquí.

## Path Conventions

Monorepo existente — `apps/api/src/`, `apps/api/test/`, `apps/web/src/`, `packages/contracts/src/`.
Sin proyecto nuevo (ver plan.md, sección "Project Structure").

---

## Phase 1: Setup

No se requiere inicialización de proyecto nuevo — se reutiliza el monorepo existente sin
dependencias nuevas. Confirmar el entorno antes de empezar:

- [x] T001 Confirmar `pnpm install`, `pnpm --filter @finance/api exec prisma generate` y
      `pnpm db:push && pnpm db:seed` corren limpios sobre el estado actual del repo (baseline antes
      de tocar el schema)

---

## Phase 2: Foundational

No hay infraestructura compartida bloqueante entre las tres historias — US1 (backend: 8 puertos
nuevos + frontend: selector compartido), US2 (`MaskedAmount`) y US3 (remoción de 3 controles)
tocan archivos completamente disjuntos. Cada historia puede implementarse y validarse por
separado; se listan en orden de prioridad (P1 → P2 → P3) pero no tienen dependencia real entre sí.

**Checkpoint**: Sin tareas foundational — pasar directo a las historias de usuario.

---

## Phase 3: User Story 1 - Limitar el universo de monedas en los selectores (Priority: P1) 🎯 MVP

**Goal**: Todo selector de moneda de la app ofrece solo `preferredCurrency + extraCurrencies` del
usuario logueado (colapsando a texto estático sin extras), y quitar una moneda extra en uso se
bloquea en el backend.

**Independent Test**: Ver `quickstart.md` Escenarios 2 y 3 — crear cuenta con 0/1+ monedas extra y
verificar el comportamiento estático↔selector; intentar quitar una moneda extra en uso y verificar
el rechazo `CURRENCY_IN_USE`.

### Backend — prerrequisito estructural (hallazgo C1 de `/speckit-analyze`)

`debt` y `recurring-expense` son los únicos 2 de los 8 dominios involucrados que **no** tienen hoy
un `*.data.module.ts` propio (todo su repositorio vive en el `*.module.ts` de orquestación) —
verificado contra el código, no asumido. Sin extraerlo primero, `user.module.ts` tendría que
importar el módulo de orquestación completo (arrastrando `CqrsModule`/controllers) para llegar al
puerto nuevo, rompiendo el patrón leaf-only que el resto del plan sigue.

- [x] T002 [P] [US1] Extraer `apps/api/src/domains/debt/debt.data.module.ts` (leaf nuevo): mover el
      binding `DEBT_REPOSITORY` desde `debt.module.ts` al leaf, y actualizar `debt.module.ts` para
      importarlo — mismo patrón ya aplicado a `installment-plan` en specs/014
- [x] T003 [P] [US1] Extraer
      `apps/api/src/domains/recurring-expense/recurring-expense.data.module.ts` (leaf nuevo): igual
      tratamiento que T002 sobre `recurring-expense.module.ts`

### Backend — puertos de "moneda en uso" (uno por dominio-tabla, en paralelo)

- [x] T004 [P] [US1] Crear `CurrencyUsageLookupPort` (`isCurrencyInUse(userId, currency)`) y su
      adapter Prisma para `bank-account` en
      `apps/api/src/domains/bank-account/domain/ports/currency-usage-lookup.port.ts` +
      `apps/api/src/domains/bank-account/infrastructure/prisma-bank-account-currency-usage-lookup.repository.ts`,
      exportado desde `apps/api/src/domains/bank-account/bank-account.data.module.ts`
- [x] T005 [P] [US1] Igual que T004 para `transaction` en
      `apps/api/src/domains/transaction/domain/ports/currency-usage-lookup.port.ts` +
      `apps/api/src/domains/transaction/infrastructure/prisma-transaction-currency-usage-lookup.repository.ts`,
      exportado desde `apps/api/src/domains/transaction/transaction.data.module.ts`
- [x] T006 [P] [US1] Igual que T004 para `installment-plan` en
      `apps/api/src/domains/installment-plan/domain/ports/currency-usage-lookup.port.ts` +
      `apps/api/src/domains/installment-plan/infrastructure/prisma-installment-plan-currency-usage-lookup.repository.ts`,
      exportado desde `apps/api/src/domains/installment-plan/installment-plan.data.module.ts`
- [x] T007 [US1] Igual que T004 para `debt` en
      `apps/api/src/domains/debt/domain/ports/currency-usage-lookup.port.ts` +
      `apps/api/src/domains/debt/infrastructure/prisma-debt-currency-usage-lookup.repository.ts`,
      exportado desde `apps/api/src/domains/debt/debt.data.module.ts` (depende de T002)
- [x] T008 [P] [US1] Igual que T004 para `savings-goal` en
      `apps/api/src/domains/savings-goal/domain/ports/currency-usage-lookup.port.ts` +
      `apps/api/src/domains/savings-goal/infrastructure/prisma-savings-goal-currency-usage-lookup.repository.ts`,
      exportado desde `apps/api/src/domains/savings-goal/savings-goal.data.module.ts`
- [x] T009 [P] [US1] Igual que T004 para `savings-entry` en
      `apps/api/src/domains/savings-entry/domain/ports/currency-usage-lookup.port.ts` +
      `apps/api/src/domains/savings-entry/infrastructure/prisma-savings-entry-currency-usage-lookup.repository.ts`,
      exportado desde `apps/api/src/domains/savings-entry/savings-entry.data.module.ts`
- [x] T010 [US1] Igual que T004 para `recurring-expense` en
      `apps/api/src/domains/recurring-expense/domain/ports/currency-usage-lookup.port.ts` +
      `apps/api/src/domains/recurring-expense/infrastructure/prisma-recurring-expense-currency-usage-lookup.repository.ts`,
      exportado desde `apps/api/src/domains/recurring-expense/recurring-expense.data.module.ts`
      (depende de T003)
- [x] T011 [P] [US1] Igual que T004 para `card-limit` en
      `apps/api/src/domains/card-limit/domain/ports/currency-usage-lookup.port.ts` +
      `apps/api/src/domains/card-limit/infrastructure/prisma-card-limit-currency-usage-lookup.repository.ts`
      (join contra `CardAccount.userId`), exportado desde
      `apps/api/src/domains/card-limit/card-limit.data.module.ts`
- [x] T012 [P] [US1] Tests de integración para los 8 adapters de T004-T011 contra Postgres real
      (cada uno: existe/no existe uso por `userId`+`currency`) en
      `apps/api/test/integration/domains/{bank-account,transaction,installment-plan,debt,savings-goal,savings-entry,recurring-expense,card-limit}/currency-usage-lookup.repository.spec.ts`
      (depende de T004-T011)

### Backend — aplicar el bloqueo en `PATCH /auth/me/preferences`

- [x] T013 [US1] Agregar `CurrencyInUseError` (código `CURRENCY_IN_USE`) en
      `apps/api/src/domains/user/domain/errors.ts`
- [x] T014 [US1] Importar los 8 `*.data.module.ts` (T004-T011) en
      `apps/api/src/domains/user/user.module.ts` e inyectar los 8 puertos en
      `UpdatePreferencesHandler` (depende de T004-T011, T013)
- [x] T015 [US1] Extender `UpdatePreferencesHandler`
      (`apps/api/src/domains/user/application/commands/update-preferences.handler.ts`): calcular
      `removed = user.extraCurrencies − patch.extraCurrencies`, consultar los 8 puertos en paralelo
      para cada moneda de `removed`, y lanzar `CurrencyInUseError` antes de `applyPreferencesUpdate`
      si alguna está en uso (depende de T014)
- [x] T016 [P] [US1] Unit tests de `UpdatePreferencesHandler` (agregar moneda siempre pasa; quitar
      moneda no usada pasa; quitar moneda en uso se rechaza con `CURRENCY_IN_USE`; quitar varias a
      la vez con una sola en uso rechaza todo el patch) en
      `apps/api/test/unit/domains/user/application/commands/update-preferences.handler.spec.ts`
      (archivo nuevo)
- [x] T017 [US1] Test e2e de `PATCH /auth/me/preferences` cubriendo el rechazo real contra Postgres
      (crear cuenta en USD, agregar USD a `extraCurrencies`, intentar quitarla, esperar 409) en
      `apps/api/test/e2e/user/update-preferences.http.spec.ts` (archivo nuevo o extender el e2e de
      auth existente si ya cubre este endpoint)

### Frontend — selector de moneda compartido

- [x] T018 [P] [US1] Crear `useAllowedCurrencies()` en
      `apps/web/src/domains/reference/hooks/useAllowedCurrencies.ts` (deriva de `useAuth()` +
      `useCurrencies()`, memoiza `[{code, name}]` con la principal primero)
- [x] T019 [US1] Crear `CurrencyField` en
      `apps/web/src/domains/reference/components/CurrencyField.tsx` (texto estático si
      `useAllowedCurrencies().length <= 1`, `SearchableSelect` acotado si no; depende de T018)
- [x] T020 [P] [US1] Unit tests de `useAllowedCurrencies` y `CurrencyField` (0 extras → estático;
      1+ extras → selector con exactamente esas opciones) en
      `apps/web/src/domains/reference/hooks/useAllowedCurrencies.test.ts` y
      `apps/web/src/domains/reference/components/CurrencyField.test.tsx` (archivos nuevos)

### Frontend — migrar los 8 formularios a `CurrencyField` (en paralelo, cada uno depende de T019)

- [x] T021 [P] [US1] Migrar el picker de moneda de
      `apps/web/src/domains/accounts/components/AccountForm.tsx` a `CurrencyField`
- [x] T022 [P] [US1] Migrar el picker de moneda de
      `apps/web/src/domains/accounts/components/AccountCreateModal.tsx` a `CurrencyField`
- [x] T023 [P] [US1] Migrar el/los picker(s) de moneda de sub-límites de
      `apps/web/src/domains/accounts/components/CardForm.tsx` a `CurrencyField`
- [x] T024 [P] [US1] Migrar el picker de moneda de
      `apps/web/src/domains/transactions/components/TransactionFormPanel.tsx` a `CurrencyField`
- [x] T025 [P] [US1] Migrar el picker de moneda de
      `apps/web/src/domains/savings/components/SavingsGoalFormPanel.tsx` a `CurrencyField`
- [x] T026 [P] [US1] Migrar el picker de moneda de
      `apps/web/src/domains/recurring/components/RecurringFormPanel.tsx` a `CurrencyField`
- [x] T027 [P] [US1] Migrar el picker de moneda de
      `apps/web/src/domains/installments/components/InstallmentFormPanel.tsx` a `CurrencyField`
- [x] T028 [P] [US1] Migrar el picker de moneda de
      `apps/web/src/domains/debts/components/DebtFormPanel.tsx` a `CurrencyField`
- [x] T029 [P] [US1] Test de regresión (hallazgo U1 de `/speckit-analyze`, cubre FR-008): un
      registro ya guardado en una moneda fuera del universo `preferredCurrency + extraCurrencies`
      vigente se sigue mostrando correctamente (no se oculta ni se transforma) — extender
      `apps/web/src/domains/accounts/routes/AccountDetailRoute.test.tsx` (o el test más relevante
      ya existente) con un caso que cargue una cuenta en una moneda no listada

### Frontend — manejo del rechazo al quitar moneda en uso

- [x] T030 [US1] En
      `apps/web/src/domains/profile/components/FinancialCustomizationSection.tsx`, manejar el
      error `CURRENCY_IN_USE` de `removeCurrency` con un toast explicativo (reusar el mapeo
      `errors.<CODE>` existente)
- [x] T031 [P] [US1] Agregar clave `errors.CURRENCY_IN_USE` en `apps/web/src/i18n/es.json` y
      `apps/web/src/i18n/en.json`

**Checkpoint**: User Story 1 completa y verificable de forma independiente (Escenarios 2 y 3 de
`quickstart.md`).

---

## Phase 4: User Story 2 - Ocultar y revelar saldos en puntos acotados (Priority: P2)

**Goal**: `MaskedAmount` gana un toggle de revelado independiente por monto, y su cobertura se
extiende a **todo** monto de dinero del Panel, al saldo de cuenta y a Ahorros (además de
patrimonio neto, ya cubierto), sin tocar Movimientos, Deudas, Recurrentes ni Cuotas/Facturación.

**Independent Test**: Ver `quickstart.md` Escenario 4 — activar "Ocultar saldos", revelar montos
independientes en Panel/cuenta/Ahorros, confirmar que Movimientos/Deudas/Recurrentes/Cuotas nunca
se enmascaran.

- [x] T032 [US2] Extender `MaskedAmount`
      (`apps/web/src/domains/profile/components/MaskedAmount.tsx`) con `useState<boolean>`
      `revealed` local y manejo de clic + teclado (Enter/Espacio, `role="button"`, `tabIndex=0`)
      que alterna el estado; mantiene su API de props (`children: ReactNode`)
- [x] T033 [P] [US2] Unit tests de `MaskedAmount`: enmascara por defecto con `hideBalances=true`,
      revela al clic/Enter, dos instancias se revelan de forma independiente, no enmascara con
      `hideBalances=false`, en
      `apps/web/src/domains/profile/components/MaskedAmount.test.tsx` (extender el existente)
- [x] T034 [US2] Envolver el saldo de cuenta en `KpiStrip` de
      `apps/web/src/domains/accounts/routes/AccountDetailRoute.tsx` con `MaskedAmount`
- [x] T035 [P] [US2] Envolver los montos de
      `apps/web/src/domains/savings/components/SavingsTotalCard.tsx` (total ahorrado, total de
      metas cerradas, total del mes, ritmo, faltante, ahorro libre) con `MaskedAmount`
- [x] T036 [P] [US2] Envolver `savedAmount`/`targetAmount` en
      `apps/web/src/domains/savings/components/SavingsGoalRow.tsx` con `MaskedAmount`
- [x] T037 [P] [US2] Envolver `savedAmount`/`targetAmount` en
      `apps/web/src/domains/savings/components/SavingsGoalTable.tsx` con `MaskedAmount`
- [x] T038 [P] [US2] Envolver faltante/ritmo en
      `apps/web/src/domains/savings/components/SavingsInsightsRail.tsx` con `MaskedAmount`
- [x] T039 [P] [US2] Envolver la suma de grupo en
      `apps/web/src/domains/savings/components/SavingsGroupHeader.tsx` con `MaskedAmount`
- [x] T040 [P] [US2] Envolver objetivo/faltante en
      `apps/web/src/domains/savings/components/SavingsGoalStatusLine.tsx` con `MaskedAmount`
- [x] T041 [P] [US2] Envolver los montos de
      `apps/web/src/domains/dashboard/components/MonthFlowCard.tsx` con `MaskedAmount`
      (hallazgo C2 de `/speckit-analyze`: el Panel mostraba dinero sin enmascarar aquí)
- [x] T042 [P] [US2] Envolver los montos de
      `apps/web/src/domains/dashboard/components/CategoryDonut.tsx` con `MaskedAmount`
      (hallazgo C2)
- [x] T043 [P] [US2] Envolver los montos de
      `apps/web/src/domains/dashboard/components/UpcomingPaymentsCard.tsx` con `MaskedAmount`
      (hallazgo C2)
- [x] T044 [US2] Actualizar el hint de "Ocultar saldos" en
      `apps/web/src/i18n/{es,en}.json` (`profile.financial.hideBalancesHint`) para reflejar el
      alcance real (Panel, saldo de cuenta, Ahorros) en vez de "toda la app"
- [x] T045 [P] [US2] Test de regresión: confirmar que `MaskedAmount` NO se usa en los componentes
      de Movimientos, Deudas, Recurrentes y Cuotas/Facturación (grep-based o snapshot de imports)
      en `apps/web/src/domains/{transactions,debts,recurring,installments}/**/*.test.tsx` (extender
      un test existente relevante de cada dominio, o agregar uno nuevo por dominio)

**Checkpoint**: User Story 2 completa y verificable de forma independiente.

---

## Phase 5: User Story 3 - Perfil sin controles decorativos (Priority: P3)

**Goal**: "Inicio del ciclo mensual", "Presupuesto mensual objetivo" y "Redondeo para ahorro"
desaparecen por completo — UI, contrato, endpoint y columnas de `User`.

**Independent Test**: Ver `quickstart.md` Escenario 1 — la sección del perfil solo ofrece los 2
controles restantes; un `PATCH` con los campos viejos devuelve 400 de validación.

### Backend

- [x] T046 [US3] Quitar `monthlyBudgetTarget` y `billingCycleStartDay` de `User` en
      `apps/api/prisma/schema.prisma`, correr `pnpm db:push`
- [x] T047 [US3] Quitar ambos campos de `updatePreferencesRequestSchema` (y de cualquier schema de
      respuesta que los exponga) en `packages/contracts/src/auth/index.ts`
- [x] T048 [US3] Quitar las dos ramas correspondientes de `applyPreferencesUpdate` (y del tipo
      `PreferencesPatch`) en `apps/api/src/domains/user/domain/user.aggregate.ts`
- [x] T049 [US3] Quitar el mapeo de ambas columnas en
      `apps/api/src/domains/user/infrastructure/prisma-user.repository.ts`
- [x] T050 [P] [US3] Actualizar los fixtures/asserts que referencian `monthlyBudgetTarget`/
      `billingCycleStartDay` en los tests unitarios existentes:
      `apps/api/test/unit/domains/user/domain/user.aggregate.spec.ts`,
      `apps/api/test/unit/domains/user/application/queries/get-me.handler.spec.ts`,
      `apps/api/test/unit/domains/user/application/commands/update-profile.handler.spec.ts`,
      `apps/api/test/unit/domains/user/application/commands/register.handler.spec.ts`,
      `apps/api/test/unit/domains/user/application/commands/refresh-token.handler.spec.ts`,
      `apps/api/test/unit/domains/user/application/commands/login.handler.spec.ts`,
      `apps/api/test/unit/domains/user/application/commands/deactivate-account.handler.spec.ts`,
      `apps/api/test/unit/domains/user/application/commands/change-password.handler.spec.ts`
      (depende de T046-T049)

### Frontend

- [x] T051 [US3] Quitar el bloque "Inicio del ciclo mensual" (incluido `CYCLE_DAYS`) de
      `apps/web/src/domains/profile/components/FinancialCustomizationSection.tsx`
- [x] T052 [US3] Quitar el bloque "Presupuesto mensual objetivo" (`editingBudget`, `budgetInput`,
      `saveBudget`) de `FinancialCustomizationSection.tsx`
- [x] T053 [US3] Quitar el switch "Redondeo para ahorro" (estado local `roundUp`) de
      `FinancialCustomizationSection.tsx`
- [x] T054 [US3] Actualizar
      `apps/web/src/domains/profile/components/FinancialCustomizationSection.test.tsx`: quitar
      asserts de los 3 controles removidos, confirmar que solo quedan "Monedas extra" y "Ocultar
      saldos" (depende de T051-T053)
- [x] T055 [P] [US3] Quitar las claves `profile.financial.{cycleStart,cycleStartHint,budgetTarget,
budgetTargetHint,roundUp,roundUpHint}` de `apps/web/src/i18n/es.json` y `en.json`
- [x] T056 [US3] Correr `apps/web/src/i18n/parity.test.ts` y confirmar paridad es/en tras T055

**Checkpoint**: User Story 3 completa — las tres historias, en conjunto, cubren el spec completo.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T057 [P] Actualizar `docs/PENDING.md`: quitar cualquier mención a
      `monthlyBudgetTarget`/`billingCycleStartDay`/"redondeo" como deuda pendiente, y anotar que
      `hideBalances` ahora cubre Panel completo + saldo de cuenta + Ahorros (ya no "cobertura
      parcial" en esos puntos)
- [x] T058 Ejecutar la validación manual completa de `quickstart.md` (los 4 escenarios) contra el
      entorno local
- [x] T059 Correr verificación técnica acotada al cambio: `pnpm --filter @finance/api test:unit`,
      `test:integration`, `test:e2e` (scoped a `user`/`bank-account`/`transaction`/
      `installment-plan`/`debt`/`savings-goal`/`savings-entry`/`recurring-expense`/`card-limit`),
      `pnpm --filter @finance/web test` (scoped a `profile`/`reference`/`accounts`/`savings`/
      `dashboard`), `pnpm typecheck`, `pnpm check:boundaries` — nunca la suite completa salvo
      pedido explícito

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sin dependencias — inicia de inmediato.
- **Foundational (Phase 2)**: Vacía — no bloquea nada.
- **User Stories (Phase 3-5)**: Cada una depende solo de Phase 1; son independientes entre sí y
  pueden implementarse en cualquier orden o en paralelo, aunque se listan en orden de prioridad
  (P1 → P2 → P3).
- **Polish (Phase 6)**: Depende de que las historias que se vayan a entregar estén completas.

### Dentro de cada historia

- **US1**: T002-T003 (extraer los 2 leaves faltantes) → T004-T011 (8 puertos backend, en paralelo,
  T007/T010 esperan su leaf respectivo) → T012 (tests de integración) → T013-T017 (bloqueo en el
  handler, secuencial entre sí) en paralelo con T018-T020 (selector compartido frontend) →
  T021-T029 (migración de los 8 formularios + test de regresión, en paralelo) → T030-T031 (manejo
  de error).
- **US2**: T032 → T033 (test) y T034-T043 (en paralelo, cada uno un archivo distinto) → T044-T045.
- **US3**: T046-T049 (backend, secuencial: schema → contrato → agregado → repositorio) → T050
  (tests) en paralelo con T051-T053 (frontend, secuencial dentro del mismo archivo) → T054-T056.

### Parallel Opportunities

- T004-T011 (los 8 puertos de "moneda en uso", salvo que T007/T010 esperan T002/T003) son en su
  mayoría paralelos entre sí — archivos y dominios distintos.
- T021-T028 (los 8 formularios que migran a `CurrencyField`) son completamente paralelos entre sí
  una vez existe T019.
- T034-T043 (los 6 componentes de Ahorros + detalle de cuenta + los 3 del Panel) son paralelos
  entre sí.
- US1, US2 y US3 pueden trabajarse en paralelo por completo (cero archivos compartidos entre
  historias).

---

## Parallel Example: User Story 1 (backend)

```bash
# Primero, los 2 leaves faltantes (bloquean solo a debt/recurring-expense más abajo):
Task: "Extraer debt.data.module.ts"
Task: "Extraer recurring-expense.data.module.ts"

# Luego, los 8 puertos de "moneda en uso" (la mayoría no espera nada más):
Task: "CurrencyUsageLookupPort + adapter para bank-account"
Task: "CurrencyUsageLookupPort + adapter para transaction"
Task: "CurrencyUsageLookupPort + adapter para installment-plan"
Task: "CurrencyUsageLookupPort + adapter para debt"              # espera el leaf de arriba
Task: "CurrencyUsageLookupPort + adapter para savings-goal"
Task: "CurrencyUsageLookupPort + adapter para savings-entry"
Task: "CurrencyUsageLookupPort + adapter para recurring-expense"  # espera el leaf de arriba
Task: "CurrencyUsageLookupPort + adapter para card-limit"
```

## Parallel Example: User Story 1 (frontend, migración de formularios)

```bash
Task: "Migrar AccountForm.tsx a CurrencyField"
Task: "Migrar AccountCreateModal.tsx a CurrencyField"
Task: "Migrar CardForm.tsx a CurrencyField"
Task: "Migrar TransactionFormPanel.tsx a CurrencyField"
Task: "Migrar SavingsGoalFormPanel.tsx a CurrencyField"
Task: "Migrar RecurringFormPanel.tsx a CurrencyField"
Task: "Migrar InstallmentFormPanel.tsx a CurrencyField"
Task: "Migrar DebtFormPanel.tsx a CurrencyField"
```

## Parallel Example: User Story 2 (envolver montos con `MaskedAmount`)

```bash
Task: "Envolver SavingsTotalCard.tsx"
Task: "Envolver SavingsGoalRow.tsx"
Task: "Envolver SavingsGoalTable.tsx"
Task: "Envolver SavingsInsightsRail.tsx"
Task: "Envolver SavingsGroupHeader.tsx"
Task: "Envolver SavingsGoalStatusLine.tsx"
Task: "Envolver MonthFlowCard.tsx"
Task: "Envolver CategoryDonut.tsx"
Task: "Envolver UpcomingPaymentsCard.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 solamente)

1. Completar Phase 1 (Setup).
2. Completar Phase 3 (US1: universo de monedas acotado + bloqueo de eliminación).
3. **DETENERSE y VALIDAR**: Escenarios 2-3 de `quickstart.md` de forma independiente.
4. Esto ya entrega valor real y es deployable por sí solo — US2 y US3 son incrementos
   independientes, no prerrequisitos.

### Entrega incremental

1. Setup → listo.
2. US1 (P1) → validar → deploy/demo.
3. US2 (P2) → validar → deploy/demo.
4. US3 (P3) → validar → deploy/demo.
5. Polish (Phase 6) al final, o después de cada historia si se prefiere ir cerrando deuda de
   documentación en el camino.

### Estrategia en paralelo (si hay más de una persona trabajando)

Dado que las 3 historias no comparten ningún archivo, se pueden asignar por completo a personas
distintas apenas termina el Setup — no hay ningún punto de sincronización forzoso entre ellas.

---

## Notes

- `[P]` = archivos distintos, sin dependencias entre sí.
- `[US1]`/`[US2]`/`[US3]` mapea cada tarea a su historia para trazabilidad.
- Los tests se agregan junto a la implementación que cubren (no todos al inicio como bloque TDD),
  siguiendo la convención ya usada en specs anteriores de este repo.
- Recordatorio de la convención del proyecto: correr tests **acotados al cambio** (ver T059), nunca
  la suite completa por defecto.
- Commitear después de cada tarea o grupo lógico, y usar los checkpoints de cada fase para validar
  antes de seguir.

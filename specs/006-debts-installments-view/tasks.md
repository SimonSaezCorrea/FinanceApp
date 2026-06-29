# Tasks: Rediseño Cuotas y Deudas

**Feature**: specs/006-debts-installments-view | **Plan**: [plan.md](./plan.md)

---

## Phase 1: Setup — paralelo

**Propósito**: Todos los prerrequisitos que no tienen dependencias entre sí.

- [ ] T001 [P] Añadir claves i18n de Deudas y Cuotas a `apps/web/src/i18n/es.json`: `debts.kpi.*` (owedToYou, youOwe, balance), `debts.card.*` (installments, paid, remaining, markPaid, registerPayment), `debts.form.*` (direction, counterparty, amount, currency, openedAt, dueAt, installments, installmentAmount, notes, directionOptions.*), `debts.new`, `debts.created`, `debts.empty`, `installments.planCard.*` (monthlyAmount, nextDue, progress), `installments.calendar.*` (seq, date, amount, status, paid, upcoming, pending), `installments.new`, `installments.created`, `installments.empty`
- [ ] T002 [P] Copiar exactamente las mismas claves de T001 a `apps/web/src/i18n/en.json` con valores en inglés
- [ ] T003 [P] Añadir 3 campos a `Debt` en `apps/api/prisma/schema.prisma`: `totalInstallments Int @default(1)`, `paidInstallments Int @default(0)`, `installmentAmount Decimal? @db.Decimal(18,4)`. Luego ejecutar `cd apps/api && npx prisma db push`
- [ ] T004 [P] Extender contratos en `packages/contracts/src/debts/index.ts`: añadir `totalInstallments: z.number().int().min(1)`, `paidInstallments: z.number().int().min(0)`, `installmentAmount: moneyString.nullable()` a `debtSchema`; añadir `totalInstallments: z.number().int().min(1).default(1)`, `installmentAmount: moneyString.optional()` a `createDebtSchema` (`updateDebtSchema` hereda via `.partial()`)
- [ ] T005 Compilar contratos: `pnpm --filter @finance/contracts build` (requerido antes de typecheck en web/api)

---

## Phase 2: Backend — Debts (secuencial después de T003, T004, T005)

**Propósito**: Endpoint `register-payment` y actualización del servicio con nuevos campos.

- [ ] T006 Actualizar `apps/api/src/domains/debts/debts.service.ts`: (a) refactorizar `update` con patrón imperativo `data[key]=v` eliminando spread ternarios (patrón S7735, igual que feature 005); (b) añadir `totalInstallments`, `paidInstallments`, `installmentAmount` en `create` y `toContract`; (c) añadir método `async registerPayment(userId, id)` que incremente `paidInstallments` en 1 y setee `settledAt=new Date()` si `paidInstallments+1 === totalInstallments`; lanzar `ConflictException({code:'DEBT_ALREADY_SETTLED'})` si `settledAt≠null` y `ConflictException({code:'ALL_INSTALLMENTS_PAID'})` si ya pagadas todas
- [ ] T007 Añadir endpoint en `apps/api/src/domains/debts/debts.controller.ts`: `@Post(':id/register-payment') @UseGuards(JwtAuthGuard) async registerPayment(@CurrentUser() user, @Param('id') id)` que llame a `this.service.registerPayment(user.id, id)` y retorne la deuda actualizada
- [ ] T008 Actualizar `apps/api/src/domains/debts/debts.service.spec.ts`: añadir `totalInstallments:1, paidInstallments:0, installmentAmount:null` a todos los mocks de `DebtRow`; añadir tests para `registerPayment` (incremento, auto-settle en último pago, error si ya saldada)

---

## Phase 3: US1 — Ver y operar deudas

**Story goal**: El usuario ve KPIs, lista de deudas en dos columnas y puede ejecutar acciones de pago.

**Independent Test**: Con deudas seeded → KPIs suman correctamente; deuda con cuotas muestra barra de progreso; botones "Marcar pagada" / "Registrar pago" aparecen según estado.

- [ ] T009 [P] [US1] Escribir tests Vitest en `apps/web/src/domains/debts/lib/debtMetrics.test.ts` (TDD, deben fallar): `summarizeDebtsByCurrency(debts: Debt[]): DebtKpi[]` agrupa por moneda sumando `OWED_TO_YOU` y `YOU_OWE` no saldadas; `calcRemaining(debt: Debt): string` retorna `(totalInstallments-paidInstallments) × (installmentAmount ?? principal/totalInstallments)` con Decimal; casos: deuda única, multi-moneda, installmentAmount null, deuda saldada excluida de KPIs
- [ ] T010 [P] [US1] Implementar `apps/web/src/domains/debts/lib/debtMetrics.ts`: exportar `DebtKpi`, `summarizeDebtsByCurrency`, `calcRemaining` usando `Decimal` de `@finance/money`; todos los tests T009 deben pasar
- [ ] T011 [P] [US1] Actualizar `apps/web/src/domains/debts/api/debtsApi.ts`: añadir función `registerPayment(id: string): Promise<debts.Debt>` que llame a `POST /debts/:id/register-payment`; asegurar que `list` y `create` mapeen los 3 nuevos campos del contrato actualizado
- [ ] T012 [P] [US1] Crear `apps/web/src/domains/debts/hooks/useDebtMutations.ts`: exportar hook con mutaciones `create` (invalida `['debts']`), `settle` (invalida `['debts']`), `registerPayment` (invalida `['debts']`), todas con toast de éxito/error via `sonner`
- [ ] T013 [US1] Implementar `apps/web/src/domains/debts/components/DebtKpiStrip.tsx`: props `{debts: Debt[]}`, llama `summarizeDebtsByCurrency` internamente, renderiza grupo por moneda con 3 cifras: "Te deben" (`text-success`), "Debes" (`text-accent`), "Balance neto" (color según signo); usa `formatMoney` de `@finance/money`; estado vacío muestra `—`
- [ ] T014 [US1] Implementar `apps/web/src/domains/debts/components/DebtCard.tsx`: props `{debt: Debt, onSettle: ()=>void, onRegisterPayment: ()=>void}`; avatar circular con inicial de `counterparty`; muestra nombre, monto+moneda, vencimiento (si existe); si `totalInstallments>1`: barra de progreso con `calcRemaining` y texto "N/M pagadas · $X restante"; botón "Marcar pagada" solo si `totalInstallments===1 && !settledAt`; botón "Registrar pago" solo si `totalInstallments>1 && paidInstallments<totalInstallments`; tokens de diseño únicamente
- [ ] T015 [US1] Rediseñar `apps/web/src/domains/debts/routes/DebtsRoute.tsx`: `useDebts()` + `useDebtMutations()`; `<PageHeader title={t('debts.title')} actions={<Button onClick={openModal}>t('debts.new')</Button>}/>`; `<DebtKpiStrip debts={activeDebts}/>`; dos columnas con `<DebtCard>` por dirección; `<LoadingState>` / `<ErrorState>` / `<EmptyState>` según estado de query; filtrar deudas con `settledAt!==null` antes de renderizar

---

## Phase 4: US2 — Crear deuda con cuotas

**Story goal**: El usuario registra una deuda nueva (simple o en cuotas) desde el modal.

**Independent Test**: Abrir modal → completar campos → guardar → deuda aparece en lista con barra de progreso correcta.

- [ ] T016 [US2] Implementar `apps/web/src/domains/debts/components/DebtCreateModal.tsx`: campos: segmentado Dirección (Te deben/Debes), texto Contraparte (required), monto+moneda (grid 2), fecha apertura (date input, default hoy), vencimiento (date input, opcional), número cuotas (number input, default 1, min 1), monto por cuota (number input, visible solo si cuotas>1, opcional), textarea Notas; submit llama `create.mutate(...)` de `useDebtMutations`; botón submit deshabilitado si falta contraparte o monto; cierra en éxito con `onOpenChange(false)`
- [ ] T017 [US2] Cablear `DebtCreateModal` en `DebtsRoute.tsx`: añadir `useState(false)` para `modalOpen`; pasar `open={modalOpen} onOpenChange={setModalOpen}` al modal; el botón "Nueva deuda" del `PageHeader` setea `modalOpen(true)`

---

## Phase 5: US3 — Registrar pago / marcar saldada

**Story goal**: El usuario marca cuotas pagadas; la deuda se auto-saldad al completar la última.

**Independent Test**: `paidInstallments` incrementa al hacer clic; barra actualiza; deuda desaparece al completar.

*(Cubierto por T012 [mutaciones] y T014 [botones en DebtCard]; el test independiente se valida manualmente con el quickstart.)*

- [ ] T018 [P] [US3] Actualizar tests en `apps/web/src/domains/debts/routes/DebtsRoute.test.tsx`: añadir `totalInstallments:1, paidInstallments:0, installmentAmount:null` a todos los mocks de `Debt` en el archivo (parity con nuevo schema)

---

## Phase 6: US4 — Ver planes de cuotas

**Story goal**: El usuario ve tarjetas de plan con progreso y calendario de pagos al seleccionar.

**Independent Test**: Con plan seeded de 12 cuotas (3 pagadas) → tarjeta muestra "3/12 pagadas"; clic → calendario con 12 filas correctas.

- [ ] T019 [P] [US4] Escribir tests Vitest en `apps/web/src/domains/installments/lib/installmentMetrics.test.ts` (TDD): `nextDuePayment(payments: InstallmentPayment[]): InstallmentPayment | null` retorna el primer payment con `paidAt===null`; `paymentStatus(p, payments): 'paid'|'upcoming'|'pending'` retorna `'paid'` si `paidAt≠null`, `'upcoming'` si es el primer no pagado, `'pending'` para el resto; `monthlyAmount(plan: InstallmentPlan): string` = `totalPrincipal / installmentCount` con Decimal
- [ ] T020 [P] [US4] Implementar `apps/web/src/domains/installments/lib/installmentMetrics.ts`: exportar `nextDuePayment`, `paymentStatus`, `monthlyAmount` usando `Decimal`; todos los tests T019 deben pasar
- [ ] T021 [P] [US4] Implementar `apps/web/src/domains/installments/components/InstallmentPlanCard.tsx`: props `{plan: InstallmentPlan, selected: boolean, onSelect: ()=>void}`; muestra título, `installmentCount` cuotas, `totalPrincipal` total, progreso `pagadas/total`, cuota mensual (`monthlyAmount`), chip "Próximo: fecha" usando `nextDuePayment`; borde `border-primary` cuando `selected`; `cursor-pointer` + `onClick={onSelect}`; tokens de diseño únicamente
- [ ] T022 [P] [US4] Implementar `apps/web/src/domains/installments/components/PaymentCalendar.tsx`: props `{plan: InstallmentPlan}`; tabla con columnas #, Fecha, Monto, Estado; `paymentStatus` determina el estado; Badge `success` para Pagada, `default` para Próxima, `muted` para Pendiente; `overflow-x: auto` wrapper
- [ ] T023 [US4] Rediseñar `apps/web/src/domains/installments/routes/InstallmentsRoute.tsx`: `useInstallments()`; `useState<string|null>(null)` para `selectedPlanId`; `<PageHeader title={t('installments.title')} actions={<Button>Nuevo plan</Button>}/>`; grid de `<InstallmentPlanCard>` con `selected={plan.id===selectedPlanId}` y `onSelect`; si `selectedPlanId`: `<PaymentCalendar plan={selectedPlan}/>` debajo de la lista; `<LoadingState>` / `<ErrorState>` / `<EmptyState>`

---

## Phase 7: US5 — Crear plan de cuotas

**Story goal**: El usuario crea un plan y el calendario se genera automáticamente.

**Independent Test**: Clic "Nuevo plan" → completar campos → guardar → plan aparece con 12 cuotas y chip de próximo vencimiento.

- [ ] T024 [US5] Crear hook `apps/web/src/domains/installments/hooks/useInstallmentMutations.ts`: exportar mutación `create` que llame a `installmentsApi.create(...)`, invalide `['installments']`, muestre toast de éxito/error
- [ ] T025 [US5] Implementar `apps/web/src/domains/installments/components/InstallmentCreateModal.tsx`: campos: texto Título (required), número Cuotas (required, min 1), monto Total (required, moneda), fecha Inicio (date input), texto Notas (opcional); submit llama `create.mutate(...)` de `useInstallmentMutations`; deshabilitado si falta título/cuotas/monto; cierra en éxito
- [ ] T026 [US5] Cablear `InstallmentCreateModal` en `InstallmentsRoute.tsx`: `useState(false)` para `modalOpen`; botón "Nuevo plan" del PageHeader abre modal

---

## Phase 8: Polish — calidad y verificación

- [ ] T027 [P] `pnpm --filter @finance/contracts build && pnpm --filter @finance/contracts typecheck` — debe pasar limpio
- [ ] T028 [P] `pnpm --filter @finance/api typecheck` — debe pasar (requiere que API no esté usando el DLL; si falla por EPERM: parar API, re-intentar)
- [ ] T029 [P] `pnpm --filter @finance/web typecheck` — debe pasar limpio
- [ ] T030 `pnpm check:boundaries` — sin violaciones de dependencias
- [ ] T031 `pnpm test --filter @finance/web` — todos los tests pasan (T009 + T019 + T018 + tests existentes)

---

## Dependencies

```
T001, T002, T003, T004          (paralelo — setup)
  → T005                        (build contracts, necesita T004)
    → T006                      (service, necesita T003+T005)
      → T007                    (controller, necesita T006)
      → T008                    (specs, necesita T006)
    → T009, T011, T012          (paralelo — necesitan T005)
      → T010 (necesita T009)
        → T013 (necesita T010+T012)
          → T014 (necesita T013+T012)
            → T015 (necesita T014)
              → T017 (necesita T015)
            → T016 (necesita T012+T015) → T017
    → T018 (necesita T005)
    → T019 (paralelo) → T020
      → T021, T022 (paralelo, necesitan T020)
        → T023 (necesita T021+T022)
          → T024 → T025 → T026
T027, T028, T029, T030, T031   (polish — tras completar todo)
```

**MVP scope**: T001–T015 → Vista Deudas operativa con KPIs, tarjetas, progreso de cuotas y acciones de pago.

**Totales**: 31 tareas · 8 fases
- Phase 1 Setup: 5 tareas
- Phase 2 Backend: 3 tareas
- Phase 3 US1 (ver deudas): 7 tareas
- Phase 4 US2 (crear deuda): 2 tareas
- Phase 5 US3 (registrar pago): 1 tarea
- Phase 6 US4 (ver cuotas): 5 tareas
- Phase 7 US5 (crear plan): 3 tareas
- Phase 8 Polish: 5 tareas

# Research: Cuotas y Deudas Redesign

## Decision 1: Endpoint para registrar pago de cuota en deuda

**Decision**: Nuevo endpoint de dominio `POST /debts/:id/register-payment` (acción, no PATCH).

**Rationale**: El registro de un pago en una deuda es una transición de estado con lógica de negocio (incrementar `paidInstallments`, auto-settle si llega al total). No es una actualización arbitraria de campos. El patrón ya existe: `POST /debts/:id/settle` (auto-settle) y `POST /installments/:planId/pay/:sequence` (marcar cuota pagada).

**Alternatives considered**:

- `PATCH /debts/:id` con `paidInstallments: paidInstallments + 1` — requiere que el frontend calcule el nuevo valor y abre la puerta a inconsistencias concurrentes.
- Reutilizar `settle` — solo aplica para deudas de 1 cuota (totalInstallments=1); no es el caso general.

---

## Decision 2: Cálculo de KPIs de deudas en el frontend

**Decision**: Los KPIs (te deben / debes / balance neto) se calculan en el frontend a partir del listado de deudas (igual que `TransactionKpiStrip`). No se añade endpoint de agregación.

**Rationale**: La lista de deudas activas (no saldadas) es pequeña por usuario. Agregar un endpoint solo para sumas duplicaría la lógica de filtrado. El patrón ya establecido en la app (KPIs calculados en frontend) es consistente.

**Alternatives considered**: Endpoint `GET /debts/summary` — sobreingeniería para el volumen de datos de un usuario individual.

---

## Decision 3: Cálculo de "monto restante" con Decimal (Constitución I)

**Decision**: En el frontend, el cálculo `(totalInstallments - paidInstallments) × installmentAmount` (o `principal / totalInstallments` cuando `installmentAmount` es null) se realiza con `Decimal` de `@finance/money`.

**Rationale**: Constitución Principio I — aritmética con `number` en montos es FORBIDDEN. El resultado se formatea con `formatMoney`.

---

## Decision 4: Vista Cuotas — solo rediseño UI, sin cambios de API

**Decision**: La vista Cuotas (`/installments`) es rediseño puro de frontend. El endpoint `POST /installments/:planId/pay/:sequence` ya existe y es suficiente para marcar pagos individuales desde el calendario si se requiriese. En este scope el calendario es solo lectura.

**Rationale**: `InstallmentsService.pay()` + `InstallmentsRepository.markPaid()` ya están implementados. El modelo `InstallmentPlan` + `InstallmentPayment` no cambia.

---

## Decision 5: DB push vs migrate dev

**Decision**: Usar `prisma db push` para aplicar los 3 nuevos campos de `Debt`. Misma estrategia que la feature 005.

**Rationale**: La carpeta `apps/api/prisma/migrations/` no existe localmente (las migraciones previas fueron aplicadas directamente a la DB). `db push` sincroniza el schema sin requerir historial de migraciones.

---

## Decision 6: Refactor del método update en DebtsService

**Decision**: Reescribir el método `update` de `DebtsService` usando el patrón imperativo (`const data: Record<string, unknown> = {}; if (...) data[key] = value`) en lugar del spread ternario actual, para evitar S7735 (SonarLint).

**Rationale**: El mismo patrón se aplicó en `TransactionsService.update()` en la feature 005. Consistencia y calidad de código.

---

## Decision 7: DebtCard — avatar con inicial del contraparte

**Decision**: El avatar del contraparte es un `div` circular con la primera letra del nombre, usando `bg-muted text-foreground`. No se usa una librería de avatares externa.

**Rationale**: Patrón simple, sin dependencias nuevas, consistente con el diseño del handoff.

---

## Decision 8: InstallmentPlanCard — selección por estado local (no URL)

**Decision**: La tarjeta de plan seleccionada (que despliega el calendario) se gestiona con `useState` local en `InstallmentsRoute`. No se persiste en la URL.

**Rationale**: Es una interacción UI dentro de la misma vista. Persistir en URL añade complejidad sin valor real para el usuario.

# Implementation Plan: Rediseño Cuotas y Deudas

**Branch**: `006-debts-installments-view` | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

## Summary

Rediseño de las vistas `/debts` e `/installments` según el handoff de diseño (secciones 7 y 6). La vista Deudas extiende el modelo `Debt` con soporte de cuotas (`totalInstallments`, `paidInstallments`, `installmentAmount`) y añade un endpoint `POST /debts/:id/register-payment`. La vista Cuotas es rediseño puro de frontend — el modelo `InstallmentPlan` no cambia.

## Technical Context

**Language/Version**: TypeScript, Node 20

**Primary Dependencies**: NestJS 10 (API), React 18 + Vite (web), Prisma 6 / PostgreSQL, `@finance/contracts` (zod), `@finance/money` (Decimal.js), Tailwind CSS, TanStack Query, shadcn-style UI primitives, Lucide icons

**Storage**: PostgreSQL vía Prisma. `db push` para los 3 nuevos campos en `Debt`.

**Testing**: Vitest (web). Tests para `debtMetrics.ts` y `installmentMetrics.ts`.

**Performance Goals**: Ambas vistas cargan en < 2 segundos (SC-003)

**Constraints**: Decimal para todo cálculo monetario (Constitución I). Per-user isolation (II). i18n parity es/en (III).

## Constitution Check

| Principio | Estado | Aplicación |
|---|---|---|
| I. Money Precision | ✅ | `debtMetrics.ts` usa `Decimal`; `installmentAmount` es `Decimal(18,4)` en Prisma |
| II. Per-User Isolation | ✅ | Repos scoped por `userId`; `@CurrentUser` en controller |
| III. i18n Parity | ✅ | Todas las claves en `es.json` y `en.json` simultáneamente |
| IV. Test-First / TDD | ✅ | Tests de métricas escritos antes de la implementación |
| V. SDD & Living Memory | ✅ | Este plan; CLAUDE.md actualizado al cierre |

## Project Structure

### Archivos a crear / modificar

#### Backend (`apps/api`)
```
prisma/schema.prisma                          ← +3 campos en Debt
src/domains/debts/
  debts.service.ts                            ← create, update (refactor), toContract, +registerPayment
  debts.controller.ts                         ← POST /:id/register-payment
  debts.service.spec.ts                       ← actualizar mocks con nuevos campos
```

#### Contratos (`packages/contracts`)
```
src/debts/index.ts                            ← debtSchema +3 campos, createDebtSchema +2
```

#### Frontend (`apps/web`)
```
src/domains/debts/
  lib/
    debtMetrics.ts                            ← NUEVO
    debtMetrics.test.ts                       ← NUEVO (TDD primero)
  components/
    DebtKpiStrip.tsx                          ← NUEVO
    DebtCard.tsx                              ← NUEVO
    DebtCreateModal.tsx                       ← NUEVO
  hooks/
    useDebtMutations.ts                       ← NUEVO (settle + registerPayment + create)
  routes/
    DebtsRoute.tsx                            ← REDISEÑADO

src/domains/installments/
  lib/
    installmentMetrics.ts                     ← NUEVO
    installmentMetrics.test.ts                ← NUEVO (TDD primero)
  components/
    InstallmentPlanCard.tsx                   ← NUEVO
    PaymentCalendar.tsx                       ← NUEVO
    InstallmentCreateModal.tsx                ← NUEVO
  routes/
    InstallmentsRoute.tsx                     ← REDISEÑADO

src/i18n/es.json                              ← nuevas claves
src/i18n/en.json                              ← nuevas claves (parity)
```

## Fases de implementación

### Fase 0 — Setup (paralelo)
- i18n keys (es + en)
- Schema Prisma + `db push`
- Contratos `@finance/contracts` + build

### Fase 1 — Backend (secuencial después de Fase 0)
- `DebtsService`: update (refactor S7735 pattern), create/toContract con campos nuevos, +`registerPayment`
- `DebtsController`: `POST /:id/register-payment`
- `debts.service.spec.ts`: actualizar mocks

### Fase 2 — Frontend Deudas (después de contratos listos)
- TDD: `debtMetrics.test.ts` → `debtMetrics.ts`
- `DebtKpiStrip.tsx`, `DebtCard.tsx`, `DebtCreateModal.tsx`
- `useDebtMutations.ts`
- `DebtsRoute.tsx` rediseño

### Fase 3 — Frontend Cuotas (paralelo con Fase 2)
- TDD: `installmentMetrics.test.ts` → `installmentMetrics.ts`
- `InstallmentPlanCard.tsx`, `PaymentCalendar.tsx`, `InstallmentCreateModal.tsx`
- `InstallmentsRoute.tsx` rediseño

### Fase 4 — Polish
- `pnpm typecheck` (contracts + web + api)
- `pnpm check:boundaries`
- `pnpm test`

## Decisiones clave

| Decisión | Elección | Razón |
|---|---|---|
| Pago de cuota deuda | `POST /debts/:id/register-payment` | Acción de dominio, no PATCH genérico |
| KPI de deudas | Calculado en frontend | Volumen pequeño, patrón ya establecido |
| Aritmética de montos | `Decimal` de `@finance/money` | Constitución I |
| Calendario cuotas | Solo lectura | Fuera de scope; `pay` endpoint ya existe |
| DB migration | `db push` | Sin historial local de migraciones |
| Update service pattern | Imperativo (`data[key] = v`) | Evita S7735, consistente con feature 005 |
| Avatar contraparte | `div` circular con inicial | Sin dependencias nuevas |
| Plan seleccionado | `useState` local | No requiere persistencia en URL |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `prisma generate` falla si API corre | Parar API → generate → reiniciar |
| Contracts no tipados → web falla | `pnpm --filter @finance/contracts build` antes de typecheck web |
| Tests de `debts.service.spec.ts` rompen | Actualizar mocks con nuevos campos en misma tarea |

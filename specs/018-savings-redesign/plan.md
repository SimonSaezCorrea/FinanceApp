# Implementation Plan: Rediseño de Ahorros con progreso real y dinero real

**Branch**: `018-savings-redesign` | **Date**: 2026-09-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/018-savings-redesign/spec.md`

## Summary

Rediseñar la vista Ahorros (`apps/web`) para mostrar progreso real, ritmo de aporte y proyección por
meta, y extender el backend `savings-goal`/`savings-entry` (`apps/api`) para que los aportes y el
cierre de una meta con destino "retirar a cuenta" muevan dinero real (crean un `Transaction`,
ajustan el saldo de una `BankAccount`), protegidos por idempotencia (Principio VII), reutilizando
exactamente los patrones ya probados en `debt` (pago/reversión reversible) e `installment-plan`
(freeze de campos tras un evento). El ritmo (`pace`) y el total ahorrado (`savedAmount`) se derivan
del historial real de aportes, nunca se declaran; el estado/agrupación/proyección de cada meta se
calculan en el frontend a partir de esos primitivos, siguiendo el mismo split que
`recurringMetrics.ts`/`projectedBalance.ts` ya usan para otros dominios. Ver `research.md` para el
detalle de cada decisión y su precedente exacto en el repo.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node 20 (sin cambios respecto al resto del monorepo).

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs` (backend), Prisma 7 vía `@prisma/adapter-pg`,
zod (`@finance/contracts`), React 19 + Vite + TanStack Query + Tailwind + Lucide (frontend),
`decimal.js` (`@finance/money`). **Ninguna dependencia nueva.**

**Storage**: PostgreSQL vía Prisma — cambios de schema en `SavingsGoal`, `SavingsEntry`,
`Transaction` (ver `data-model.md`), sin migración formal (`pnpm db:push` + `pnpm db:seed`, dev only).

**Testing**: Vitest — `apps/api/test/{unit,integration,e2e}` (mirror de `src/domains/{savings-goal,
savings-entry}/`), tests de componente/unit en `apps/web`.

**Target Platform**: Web SPA (`apps/web`) consumiendo la API REST de `apps/api` sobre HTTP.

**Project Type**: Aplicación web ya existente (monorepo Turborepo, `apps/api` + `apps/web` +
`packages/contracts`/`packages/money`) — esta feature extiende dominios existentes, no crea
aplicaciones nuevas.

**Performance Goals**: Sin objetivos nuevos más allá de los ya vigentes (UI interactiva, sin
paginación especial — el volumen de metas/aportes por usuario es bajo, orden de decenas).

**Constraints**: Sin librerías nuevas; respeta table-first (una tabla = un dominio, capas
domain/application/infrastructure/presentation); no puede romper `pnpm check:boundaries`; toda
escritura de dinero real pasa por `BaseIdempotentCommandHandler` (Principio VII); todo query
respeta el aislamiento por `userId` (Principio II); todo id nuevo usa `rowId`/UUID v7 (Principio
VIII).

**Scale/Scope**: Escala de finanzas personales — decenas de metas y aportes por usuario, no
requiere paginación ni límites de volumen nuevos.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Data gates (always applicable — see Principles II, VII y VIII):**

- [x] **Toda entidad nueva declara formato de identificador conforme al principio de
      Identificadores.** No se crean tablas nuevas — solo columnas en `SavingsGoal`/`SavingsEntry`/
      `Transaction` (`rowId` ya rige sus PKs). Las columnas de bookkeeping planas nuevas
      (`closeAccountId`, `closeTransactionId`, `closeTargetGoalId`, `SavingsEntry.transactionId`) no
      son FKs validadas en el borde: se escriben SIEMPRE server-side con un id ya generado por
      `generateRowId()`/resuelto de una entidad propia, nunca desde el body de un request — mismo
      tratamiento que `Debt.lastPaymentTransactionId`. `closeSavingsGoalSchema.accountId`/
      `targetGoalId` y `createSavingsEntrySchema.bankAccountId`/`savingsGoalId` SÍ son `rowId` en el
      contrato (input real del cliente).
- [x] **Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia
      satisface.** Forma (c) — client-supplied `Idempotency-Key` + `idempotency-record`'s
      `@@unique([userId, key])` — para las 5 operaciones de dinero real: `savingsEntry.create`
      (extendida), `savingsEntry.update`, `savingsEntry.remove`, `savingsGoal.close`,
      `savingsGoal.reopen` (ver `research.md` §6 y `contracts/savings.md`). Los demás endpoints
      tocados (`POST/PATCH/DELETE /savings/goals`, sin mover dinero) no lo necesitan — mismo criterio
      que excluyó `DELETE /savings/goals/:id` en specs/015.
- [x] **Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership.**
      `createSavingsEntrySchema.bankAccountId` → verificado en `loadContext` del handler vía
      `BankAccountRepositoryPort`/`BankAccountLookupPort` (mismo patrón que `debt`/`installment-plan`
      ya usan para su propio `paymentAccountId`/`cardId`). `savingsGoalId` (en `createSavingsEntrySchema`
      y ya existente) → verificado contra `SavingsGoalRepositoryPort` (ya lo hacía antes de esta
      feature). `closeSavingsGoalSchema.accountId` → mismo `BankAccountRepositoryPort`.
      `closeSavingsGoalSchema.targetGoalId` → `SavingsGoalRepositoryPort`, con el chequeo adicional de
      que sea una meta ABIERTA del mismo usuario y la misma moneda (`SAVINGS_GOAL_TARGET_NOT_OPEN`/
      `SAVINGS_GOAL_TARGET_CURRENCY_MISMATCH`).

Sin violaciones — no hace falta la sección de Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/018-savings-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── savings.md       # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/contracts/src/
├── savings/index.ts                    # extendido: closeDestination, closeSavingsGoalSchema,
│                                        #   savingsSummarySchema, bankAccountId en entry, etc.
├── idempotency/index.ts                # extendido: 4 operaciones nuevas en IDEMPOTENT_OPERATIONS
└── transactions/index.ts               # extendido: sourceOf() gana SAVINGS/SAVINGS_WITHDRAWAL

apps/api/src/domains/
├── savings-goal/
│   ├── domain/
│   │   ├── savings-goal.aggregate.ts   # + close()/reopen(), invariantes de moneda fija
│   │   └── errors.ts                   # + 5 errores nuevos (ver data-model.md)
│   ├── application/commands/
│   │   ├── close-savings-goal.{command,handler}.ts     # nuevo, BaseIdempotentCommandHandler
│   │   └── reopen-savings-goal.{command,handler}.ts    # nuevo, BaseIdempotentCommandHandler
│   ├── application/queries/            # list/get: + savedAmount, pace derivados
│   ├── infrastructure/prisma-savings-goal.repository.ts # + saveWithTx, findOneForUpdateWithTx
│   ├── presentation/savings.controller.ts               # + POST .../close, .../reopen (antes de :id)
│   └── savings-goal.data.module.ts     # NUEVO leaf (ver research.md §7)
├── savings-entry/
│   ├── domain/
│   │   ├── savings-entry.aggregate.ts  # + assertEditable/assertDeletable (meta cerrada)
│   │   └── errors.ts
│   ├── application/commands/
│   │   ├── create-savings-entry.handler.ts   # extendido: mueve dinero real
│   │   ├── update-savings-entry.handler.ts   # extendido: revierte+aplica, ahora idempotente
│   │   └── remove-savings-entry.handler.ts   # extendido: revierte, ahora idempotente
│   └── infrastructure/prisma-savings-entry.repository.ts # + saveWithTx, removeWithTx,
│                                                          #   reassignGoalWithTx, sumsByGoal
├── transaction/domain/ports/transaction-writer.repository.port.ts  # + savingsEntryId/savingsGoalId
└── bank-account/                       # sin cambios de forma — se reutiliza incrementBalanceWithTx

apps/api/prisma/schema.prisma           # columnas nuevas (ver data-model.md), sin migración formal

apps/web/src/domains/savings/
├── api/savingsApi.ts                   # + closeGoal, reopenGoal, updateEntry, removeEntry, summary
├── hooks/useSavings.ts                 # + useSavingsSummary, mutations completas (create/update/
│                                        #   remove entry, close/reopen goal), Idempotency-Key por intento
├── lib/
│   ├── savingsMetrics.ts               # NUEVO — pct/left/eta/estado/agrupación (fórmulas del README)
│   └── goalVisual.ts                   # NUEVO — ícono/color determinístico por goal.id
├── components/
│   ├── SavingsTotalCard.tsx            # NUEVO — tarjeta de total + barra apilada + leyenda
│   ├── SavingsGroupHeader.tsx          # NUEVO
│   ├── SavingsGoalRow.tsx              # NUEVO — fila de meta (chip, barra, estado, montos, acciones)
│   ├── ClosedGoalsSection.tsx          # NUEVO — franja colapsable + lista de cerradas
│   ├── FreeSavingsSection.tsx          # NUEVO — bloque de ahorro libre
│   ├── SavingsGoalDetailPanel.tsx      # NUEVO — sobre shared/ui/overlay/side-panel
│   ├── SavingsGoalFormPanel.tsx        # NUEVO — sobre shared/ui/overlay/form-surface
│   ├── SavingsEntryFormPanel.tsx       # NUEVO — panel "Registrar aporte"
│   └── SavingsGoalClosePanel.tsx       # NUEVO — panel "Cerrar meta" con destino
└── routes/SavingsRoute.tsx             # REESCRITA — orquesta todo lo de arriba
```

**Structure Decision**: se reutiliza la estructura table-first existente sin crear dominios nuevos
(`savings-goal`/`savings-entry` ya existen); el único artefacto estructural nuevo en backend es el
leaf `savings-goal.data.module.ts` que faltaba (deuda estructural preexistente, ver `research.md`
§7). En frontend se sigue el layout `domains/<feature>/{api,hooks,lib,components,routes}` ya usado
por `recurring`/`debts`/`installments`.

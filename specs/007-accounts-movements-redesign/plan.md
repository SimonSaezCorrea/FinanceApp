# Implementation Plan: Rediseño Cuentas y Movimientos con tarjetas secundarias

**Branch**: `007-accounts-movements-redesign` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-accounts-movements-redesign/spec.md`

## Summary

Rediseñar los dominios **accounts** y **transactions** para: (1) añadir número de cuenta bancaria; (2) modelar tarjetas secundarias con auto-relación (`Card.parentCardId`), pool de cupo compartido para crédito y sub-tope propio; (3) convertir el "usado" del cupo de valor manual a **semilla (`initialUsed`) + derivado de gastos** (reconciliable on-read, espejo de `initialBalance`/`currentBalance`); (4) reforzar movimientos: banco obligatorio, gasto no-efectivo exige tarjeta, ingreso sin tarjeta, con enforcement de cupo; (5) CRUD completo de movimientos desde ambas vistas; (6) filtro banco→tarjeta funcional (corregir bug de `cardId` no enviado) e inactivas con tag; (7) limpiar la vista de detalle de Cuenta (quitar duplicados Tarjetas/Información, tarjetas uniformes, "Añadir tarjeta" en modal, movimientos con el formato de la tabla global).

Enfoque técnico: extender esquema Prisma + contratos zod, lógica en servicios (accounts/cards/transactions), y reutilizar el sistema de diseño (`shared/ui`) unificando el componente de fila/tabla de movimientos entre vistas.

## Technical Context

**Language/Version**: TypeScript, Node 20
**Primary Dependencies**: NestJS 10, Prisma 6, React 18, Vite, TanStack Query, Tailwind, Radix (`dialog`), Zod (`@finance/contracts`), `@finance/money` (decimal.js)
**Storage**: PostgreSQL (Prisma, `apps/api` sole owner)
**Testing**: Vitest (apps + packages)
**Target Platform**: Web (API deployable + SPA)
**Project Type**: web (monorepo pnpm + Turborepo: `apps/api`, `apps/web`, `packages/*`)
**Performance Goals**: interacción de UI fluida; agregación de `used` por tarjeta en una sola query por listado (sin N+1), patrón `attachSeries`.
**Constraints**: money nunca en float (decimal strings + Prisma.Decimal); per-user isolation (`userId` en cada query); i18n es/en paridad; errores como códigos language-agnostic; boundaries `apps → packages`, `api ↛ web`.
**Scale/Scope**: uso personal/hogar; 2 dominios tocados (accounts, transactions) + 1 paquete (contracts) + 1 migración Prisma.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio | Cumplimiento en este plan |
| --------- | ------------------------- |
| I. Money Precision (NON-NEG) | `initialUsed`/`limit`/`used` en `Decimal(18,4)`; agregaciones con `@finance/money`; decimal strings en contrato. ✅ |
| II. Per-User Data Isolation (NON-NEG) | Toda query nueva (groupBy gastos por tarjeta, validación de padre, enforcement) scoped por `userId`. ✅ |
| III. i18n Parity (NON-NEG) | Nuevas cadenas (modal tarjeta, edit/delete movimiento, tag inactiva, número de cuenta, errores de cupo) en es.json y en.json con claves idénticas. ✅ |
| IV. Test-First / TDD (NON-NEG) | Vitest: tests de la lógica de pool/sub-tope y reglas tarjeta/tipo antes de implementar; money rules cubiertas. ✅ |
| V. SDD & Living Memory (NON-NEG) | Cambios de esquema/contrato/errores ⇒ actualizar `constitution.md` + `CLAUDE.md` en la fase de memory-sync del `/sdd`. ✅ |

Arquitectura: se respeta domain-first (`accounts`, `transactions`), repository como único touchpoint Prisma, validación zod (`ZodValidationPipe`), one-way deps. **Sin violaciones** → Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/007-accounts-movements-redesign/
├── plan.md              # este archivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1 (deltas de contrato por dominio)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   ├── schema.prisma                         # + accountNumber, parentCardId, CardLimit.initialUsed
│   └── migrations/<ts>_secondary_cards/      # migración + backfill initialUsed=used
└── src/domains/
    ├── accounts/
    │   ├── accounts.service.ts               # accountNumber; compute used derivado (agrega secundarias)
    │   ├── accounts.repository.ts            # groupBy EXPENSE por cardId (sum), scoped userId
    │   ├── cards.service.ts                  # parentCardId, initialUsed; validación de padre
    │   ├── cards.repository.ts               # crear/actualizar con parentCardId + initialUsed
    │   └── *.spec.ts                         # pool/sub-tope, integridad de padre
    └── transactions/
        ├── transactions.service.ts          # reglas banco/tarjeta/tipo + enforcement de cupo
        ├── transactions.repository.ts        # (sin cambios estructurales)
        └── transactions.service.spec.ts      # reglas + enforcement (TDD)

packages/contracts/src/
├── accounts/index.ts                         # accountNumber; cardLimit initialUsed+used; parentCardId
└── transactions/index.ts                     # bankAccountId requerido (create); refine INCOME⇒!cardId

apps/web/src/domains/
├── accounts/
│   ├── routes/AccountDetailRoute.tsx         # quitar tabs cards/info del main; solo movimientos (tabla global); sidebar: N tarjetas uniformes + info
│   ├── components/AccountVisualCard.tsx      # visual único reutilizado para las N tarjetas; muestra accountNumber
│   ├── components/CardCreateModal.tsx        # NUEVO: "Añadir tarjeta" abre modal (envuelve CardForm)
│   ├── components/CardForm.tsx               # + parentCardId (selector de principal), + initialUsed
│   └── api/*, hooks/*                        # accountNumber, parentCardId, initialUsed
└── transactions/
    ├── components/TransactionTable.tsx       # reutilizable; acciones editar/eliminar por fila
    ├── components/TransactionCreateModal.tsx # crear+editar (modo edición); banco→tarjeta condicional por tipo/efectivo
    ├── components/TransactionFiltersBar.tsx  # banco→tarjeta; tag "Inactiva"
    ├── api/transactionsApi.ts                # FIX: serializar cardId en toQuery
    └── routes/TransactionsRoute.tsx          # wire edit/delete

apps/web/src/i18n/{es,en}.json                # nuevas claves (paridad)
```

**Structure Decision**: Monorepo web existente. Se extienden los dominios `accounts` y `transactions` en ambos apps + `packages/contracts`. No se crean dominios nuevos; se sigue el skeleton module→controller→service→repository. El componente de fila de movimiento se unifica reutilizando `TransactionTable` para congruencia entre la vista global y la de Cuenta.

## Design decisions (resumen; detalle en research.md / data-model.md)

1. **`used` derivado** (research D3): `CardLimit.initialUsed` semilla; `used` = initialUsed + Σ gastos de crédito, computado on-read; principal agrega secundarias. Enforcement al escribir contra sub-tope y pool.
2. **Auto-relación de tarjetas** (research D2): `Card.parentCardId`, un nivel, cascade; pool solo entre CREDIT.
3. **Reglas de movimiento** (research D5): banco requerido (create); INCOME⇒sin tarjeta (contrato); EXPENSE no-efectivo⇒tarjeta obligatoria, EXPENSE efectivo⇒sin tarjeta (servicio, lee `account.type`).
4. **Errores** (research D6): `CARD_LIMIT_EXCEEDED`, `CARD_SUBLIMIT_EXCEEDED`, `CARD_REQUIRED`, `CARD_NOT_ALLOWED`, `CARD_ACCOUNT_MISMATCH`, `PARENT_CARD_INVALID`.
5. **Frontend** (research D7): quitar duplicación (tabs cards/info del main → info al sidebar, movimientos en main con tabla global); tarjetas uniformes con `AccountVisualCard`; "Añadir tarjeta" en modal; CRUD de movimiento en ambas vistas; fix `cardId` en `toQuery`; tag "Inactiva".

## Complexity Tracking

Sin violaciones de constitución. (Tabla no aplica.)

## Post-Design Constitution Re-check

Tras el diseño (research + data-model + contracts): sin nuevas dependencias, sin violaciones de boundaries, money/isolation/i18n/errores respetados. Gate ✅.

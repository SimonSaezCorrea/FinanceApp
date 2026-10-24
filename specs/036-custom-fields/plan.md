# Implementation Plan: Campos personalizados en los movimientos

**Branch**: `036-custom-fields` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/036-custom-fields/spec.md`

## Summary

Cada persona define campos propios para sus movimientos (sí/no, texto, número, fecha o lista), con
un alcance (tipo de movimiento, cuentas, clase de tarjeta) y un valor por defecto; los usa para
filtrar y sumar en Movimientos, marcar en bloque (con confirmación y deshacer), verlos como
columna, importarlos/exportarlos con la plantilla, y (P2) "Transferir pendientes": un traspaso por
la suma de los pendientes que los marca, reversible al borrar el traspaso.

Técnicamente: dos tablas nuevas, cada una su dominio (`custom-field` con las cuatro capas y el
agregado dueño de las reglas de valor; `transaction-field-value` solo datos). El filtro cruza
dominios por conjuntos de ids resueltos por puertos, nunca por join (R6). Valores tipados en
columnas, "sin valor" = sin fila (R2). Endpoints nuevos bajo `/custom-fields`, `PATCH
/transactions/:id/custom-fields` y `POST /transactions/transfers/cover`. Web: sección nueva
"Campos" en la barra lateral, filtro/inputs/columnas/modo selección en Movimientos, columnas
dinámicas en la plantilla. Ver [research.md](./research.md) R1–R14.

## Technical Context

**Language/Version**: TypeScript 5, Node 22

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs`, Prisma 7 (`@prisma/adapter-pg`), zod
(`@finance/contracts`), `@finance/money`; web React 19 + Vite, TanStack Query, react-router v8,
sonner, `exceljs`/`read-excel-file` (plantilla). **Sin dependencias nuevas.**

**Storage**: PostgreSQL 16; migración de expansión `<timestamp>_custom_fields` (2 tablas + 2 enums).

**Testing**: Vitest — unit (sin BD), integration y e2e contra Postgres desechable
(`pnpm test:integration:local`), web con Testing Library.

**Target Platform**: API en EC2 (Docker), app en Cloudflare Pages.

**Project Type**: monorepo web (api + web + packages).

**Performance Goals**: SC-003 marcar 500 en < 5 s; SC-004 importar 2.000 filas con campos ≤ +20 %;
listar/filtrar una página sin consultas extra por fila (una consulta de valores por página).

**Constraints**: Principio VI (sin joins entre dominios) → filtro por conjuntos de ids, acotado
por los movimientos de una persona (límite de parámetros de Postgres documentado en R6);
compatibilidad de deploy (migración solo de expansión; `customFields` opcional en las respuestas).

**Scale/Scope**: ≤ 20 campos y ≤ 50 opciones por persona; ≤ 5.000 movimientos por asignación;
hoy < 3.000 movimientos por persona.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio                              | Cumple | Cómo                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Money Precision                     | ✅     | Suma de "Transferir pendientes" con `@finance/money`; `numberValue` es `Decimal(24,8)` y cruza como string decimal.                                                                                                                                                                                                                                                                               |
| II. Aislamiento por usuario            | ✅     | Ambas tablas con `userId` y toda consulta acotada. FKs del cuerpo verificadas: `scope.accountIds` (`BankAccountLookupPort.accountOwned` por cada una), `fieldId`/`:id` (`findOwned`), `transactionId`/`target.ids` (`TransactionScopeLookupPort.shapesFor` filtra por `userId`; los que no vuelven → 404), `fromAccountId`/`toAccountId` (como cualquier traspaso, `TRANSFER_ACCOUNT_NOT_FOUND`). |
| III. i18n                              | ✅     | `customFields.*`, `nav.customFields`, `errors.*` nuevos en es/en de `@finance/i18n`; nombres/opciones de campo no se traducen (los escribe la persona).                                                                                                                                                                                                                                           |
| IV. TDD                                | ✅     | Tests primero por capa: agregado/`appliesTo`/`parseValue` (unit), adapters y filtro por ids (integration), endpoints (e2e), web por componente.                                                                                                                                                                                                                                                   |
| V. SDD + memoria                       | ✅     | Este ciclo; al cerrar, constitución (tabla/dominio count 32→34) y `CLAUDE.md`.                                                                                                                                                                                                                                                                                                                    |
| VI. DDD + CQRS, una tabla = un dominio | ✅     | `custom-field` (4 capas) y `transaction-field-value` (domain + infrastructure), hojas `*.data.module.ts`; `transaction` no lee la tabla de valores: recibe ids. Grafo: `transaction.module` y `custom-field.module` importan solo hojas.                                                                                                                                                          |
| VII. Idempotencia                      | ✅     | Tabla R9: `POST /custom-fields` (b), `PATCH` (b), `DELETE` (a), valores de un movimiento (b), asignación en bloque (c), revert (a, compare-and-set), cover (c, mueve saldo).                                                                                                                                                                                                                      |
| VIII. Identificadores                  | ✅     | UUID v7 en ambas tablas e ids de opción; `rowId` en path params, `fieldId` (claves del record), `target.ids`, `scope.accountIds`, `optionId`.                                                                                                                                                                                                                                                     |

**Data gates (always applicable — see Principles II, VII and VIII):**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de Identificadores. — UUID v7 en `custom-field`, `transaction-field-value` y opciones.
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface. — research.md R9.
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership. — fila II de la tabla.

**Re-check post-diseño**: sin violaciones; no hay Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/036-custom-fields/
├── spec.md
├── plan.md              # este archivo
├── research.md          # R1–R14
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/prisma/
├── schema.prisma                                   # CustomField, TransactionFieldValue, 2 enums
└── migrations/<ts>_custom_fields/migration.sql     # NUEVO

apps/api/src/domains/
├── custom-field/                                   # NUEVO (4 capas)
│   ├── domain/{custom-field.aggregate.ts, scope.ts (appliesTo), value.ts (parseValue), errors.ts, ports/}
│   ├── application/commands/{create,update,remove}-custom-field, set-transaction-values,
│   │                        assign-values (idempotente), revert-assignment
│   ├── application/queries/{list-custom-fields, count-scope, preview-assignment}
│   ├── infrastructure/prisma-custom-field.repository.ts
│   ├── presentation/{custom-fields.controller.ts, transaction-custom-fields.controller.ts}
│   ├── custom-field.data.module.ts
│   └── custom-field.module.ts
├── transaction-field-value/                        # NUEVO (domain + infrastructure)
│   ├── domain/ports/transaction-field-value.repository.port.ts
│   ├── infrastructure/prisma-transaction-field-value.repository.ts
│   └── transaction-field-value.data.module.ts
├── transaction/
│   ├── application/queries/transaction-list-filter.ts   # filtro por campo → ids (async)
│   ├── application/queries/summarize-by-field.*         # NUEVO (FR-016c)
│   ├── application/commands/create-transaction.handler.ts, create-transfer.handler.ts  # defaults + valores
│   ├── application/commands/remove-transfer.handler.ts, remove-transaction.handler.ts  # revertCover (FR-025)
│   ├── application/commands/cover-with-transfer.*       # NUEVO P2 (idempotente)
│   ├── application/transfer-legs.ts                     # extraer writeTransferPairWithTx
│   ├── application/custom-field-values.ts               # NUEVO: resolver defaults + explícitos
│   ├── domain/ports/transaction-scope-lookup.port.ts    # NUEVO (hoja)
│   ├── infrastructure/prisma-transaction.repository.ts  # ids in/notIn + scopeWhere
│   └── presentation/transactions.controller.ts          # filtros, summary/by-field, transfers/cover
├── card-account/…                                  # idsByKind
├── bank-account/application/account-deletion.ts    # podar alcances + revertCover
└── import/                                         # template-plan + handlers: customFields por fila

packages/contracts/src/
├── custom-fields/index.ts                          # NUEVO
├── transactions/…                                  # filtros, customFields, cover
└── imports/…                                       # customFields por fila

packages/i18n/src/{es,en}.json                      # customFields.*, nav, errors

apps/web/src/
├── domains/custom-fields/                          # NUEVO: api, hooks, components, routes
├── domains/transactions/components/…               # filtro, inputs, columnas, modo selección,
│                                                   #   BulkAssignBar, CoverTransferPanel (P2)
├── domains/import/lib/{templateSpec,buildTemplate,readTemplate,resolveTemplate,templateData}.ts
└── app/{AppLayout.tsx, router.tsx}                 # sección "Campos"

apps/api/test/{unit,integration,e2e}/domains/{custom-field,transaction-field-value,transaction,import}/
```

**Structure Decision**: monorepo existente; dos table-domains nuevos en `apps/api`, un dominio
nuevo en `apps/web`, módulo nuevo en `@finance/contracts`.

## Complexity Tracking

Sin violaciones de la constitución.

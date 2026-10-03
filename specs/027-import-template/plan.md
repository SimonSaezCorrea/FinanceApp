# Implementation Plan: Plantilla oficial de importación en bloque

**Branch**: `027-import-template` | **Date**: 2026-09-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/027-import-template/spec.md`

## Summary

Una plantilla `.xlsx` oficial, **generada en el navegador** con los datos del usuario (cuentas,
tarjetas, categorías en listas desplegables), con una hoja por tipo de dato. El usuario la llena y
la sube: el navegador la lee (`read-excel-file`, ya presente), resuelve nombres → ids y detecta
errores de forma; el API la valida de verdad (`POST /import/template/preview`, sin escribir) y la
aplica todo-o-nada (`POST /import/template`, idempotente, una sola `$transaction`). La lógica de
negocio no se reescribe: cada registro se construye con el `planCreation` de su agregado y cada
efecto en dinero pasa por `MovementPolicy`/`TransferPolicy`, sobre una línea de tiempo por cuenta.
Dos decisiones de la clarificación tocan el modelo existente: una cuota de plan con crédito pagada
fuera de la app nunca se factura (filtro `paidAt: null` en la selección de facturación) y libera
cupo; y cada cuenta elige si su saldo actual ya incluye lo importado (se ajusta el saldo de
apertura) o si se suma.

## Technical Context

**Language/Version**: TypeScript 5, Node 20

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs`, Prisma 7, zod (`@finance/contracts`),
`@finance/money`; web: React 19, TanStack Query, `read-excel-file` (existente), **`exceljs` 4.4.0
(nueva, solo `apps/web`, cargada bajo demanda)** — research R1

**Storage**: PostgreSQL; sin tablas ni columnas nuevas

**Testing**: Vitest — unit (fake ports, cero DB), integration (adapters reales), e2e (HTTP), web
(Testing Library)

**Target Platform**: SPA en navegador + API Node

**Project Type**: web (monorepo `apps/api` + `apps/web` + `packages/contracts`)

**Performance Goals**: plantilla de 2.000 filas → resumen en < 10 s (SC-005); 5.000 filas máximo

**Constraints**: todo-o-nada en una transacción (timeout explícito 60 s, research R4); sin FX;
cero texto localizado desde el API

**Scale/Scope**: migración inicial, una vez por usuario; ~300 filas en el caso de referencia

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio                              | Cómo se cumple                                                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Money Precision                     | Montos `moneyString` en el contrato; toda suma con `@finance/money`; nada en `number`.                                                                                                                                                        |
| II. Per-User Isolation                 | `loadContext` verifica ownership de cada FK del body antes de persistir (contrato §Ownership); tarjeta ajena ≠ "sin tarjeta".                                                                                                                 |
| III. i18n Parity                       | Plantilla y pantallas con textos en `es.json`/`en.json` (research R1: por eso se genera en web); el API solo devuelve códigos. `parity.test.ts` lo cubre.                                                                                     |
| IV. Test-First                         | Tests por capa antes de la implementación (ver tasks).                                                                                                                                                                                        |
| V. SDD & Living Memory                 | Esta spec; CLAUDE.md + constitución al cerrar.                                                                                                                                                                                                |
| VI. DDD + CQRS, una tabla = un dominio | Comando en `import` (sin tabla); cada tabla se escribe por el puerto de su dominio (`*WithTx`); agregados dueños de sus reglas (`planCreation`). Precedente de transacción cruzada: `PayCreditStatementHandler`, `ImportTransactionsHandler`. |
| VII. Idempotencia                      | `POST /import/template`: forma (c), `Idempotency-Key`, operación `import.template`. `preview` no escribe.                                                                                                                                     |
| VIII. Identificadores                  | Sin entidades nuevas; ids nuevos UUID v7 (`@default(uuid(7))`/`generateRowId()`); todo id del body es `rowId`.                                                                                                                                |

**Data gates:**

- [x] Toda entidad nueva declara formato de identificador — no hay entidades nuevas; filas nuevas de tablas existentes usan UUID v7.
- [x] Todo endpoint de escritura nuevo declara su idempotencia — `POST /import/template`: forma (c).
- [x] Toda FK del body declara dónde se verifica ownership — `ImportTemplateHandler.loadContext` (contrato §Ownership).

**Re-check post-diseño**: sin violaciones. Sin entradas en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/027-import-template/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/import-template.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/import/
├── template.ts                 # NUEVO: schemas de filas, request, preview response, límite, claves de hoja
└── index.ts                    # re-export

apps/api/src/domains/
├── import/
│   ├── domain/template-plan.ts                       # NUEVO: planTemplateImport (puro)
│   ├── domain/errors.ts                              # + TemplateRowRejectedError y códigos IMPORT_*
│   ├── application/commands/import-template.{command,handler}.ts   # NUEVO (idempotente)
│   ├── application/queries/preview-template.{query,handler}.ts     # NUEVO
│   ├── application/template-context.loader.ts        # NUEVO: carga + ownership de todo el body
│   ├── presentation/import.controller.ts             # + 2 rutas
│   └── import.module.ts                              # + data modules de debt/plan/payment/recurring/savings
├── installment-payment/infrastructure/prisma-installment-payment.repository.ts  # filtro paidAt: null
├── debt/ recurring-expense/ savings-goal/           # createWithTx en puerto + adapter
├── bank-account/                                    # adjustOpeningWithTx
└── transaction/                                     # createManyWithTx con id opcional

apps/api/test/{unit,integration,e2e}/domains/import/         # template-plan, handler, adapters, HTTP

apps/web/src/domains/import/
├── lib/templateSpec.ts          # NUEVO: hojas, columnas, claves ↔ rótulos i18n, versión
├── lib/buildTemplate.ts         # NUEVO: genera el xlsx con exceljs (import dinámico)
├── lib/readTemplate.ts          # NUEVO: reconoce hojas/columnas, arma filas tipadas + errores de forma
├── lib/resolveTemplate.ts       # NUEVO: nombres → ids, refs, errores por hoja/fila
├── components/TemplateImportPanel.tsx   # NUEVO: subir, errores, resumen, modos de saldo, confirmar
├── hooks/useTemplateImport.ts   # NUEVO: preview + commit (Idempotency-Key)
└── routes/ImportRoute.tsx       # + tarjeta "Plantilla Cuadra" (descargar / subir)
apps/web/src/i18n/{es,en}.json   # import.template.*
```

**Structure Decision**: monorepo existente. Todo el trabajo nuevo del API vive en el dominio
`import` (sin tabla, orquesta); los dominios con tabla solo ganan métodos de puerto `*WithTx` y un
filtro. El web extiende el dominio `import` existente junto al importador de cartolas.

## Complexity Tracking

Sin violaciones de la constitución que justificar.

Nota de diseño (no violación): `planTemplateImport` es la pieza más grande — combina 9 tipos de fila
en una línea de tiempo por cuenta. Se mantiene pura (sin I/O) para que cada regla sea testeable en
unit sin base de datos, igual que `planImport` y `installment-billing.ts`.

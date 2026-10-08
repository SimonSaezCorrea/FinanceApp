# Implementation Plan: Tipos de cambio y conversión estimada USD↔CLP, UF

**Branch**: `030-exchange-rates` | **Date**: 2026-10-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/030-exchange-rates/spec.md`

## Summary

Registrar cada día el dólar observado y la UF (mindicador.cl) en una tabla global nueva, y usar esos
valores para **sugerir** — siempre editables, nunca escritas solas — conversiones en: pagar y prepagar una
facturación USD, el equivalente en pesos de las cuentas USD (más un total estimado en el patrimonio) y el
traspaso USD→CLP. Para que la sugerencia tenga dónde montarse, 030 **absorbe 028 US2**: hoy la facturación
en otra moneda no se puede pagar (el handler ignora `chargedAmount` y la UI oculta toda acción); se
implementa con el diseño ya escrito en `specs/028-multi-currency-billing/research.md` R3–R5/R10/R13 y se
extiende al prepago (R8). 028 US3 (traspasar una facturación vencida) queda fuera.

## Technical Context

**Language/Version**: TypeScript, Node 20 (pnpm + Turborepo monorepo)

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs` + `@nestjs/schedule` (ya presentes); Prisma 7 +
`@prisma/adapter-pg`; `decimal.js` vía `@finance/money`; web: React 19, TanStack Query, Recharts (ya
presentes). **Sin dependencias nuevas** — la llamada a mindicador usa `fetch` nativo, igual que
`GeoIpLookup`.

**Storage**: PostgreSQL; una tabla nueva `exchange-rate` (ver `data-model.md`); `db push`, sin migraciones.

**Testing**: Vitest (unit sin DB, integration y e2e contra Postgres real); TDD (Principio IV).

**Target Platform**: API Node + SPA web (desktop, tablet, teléfono).

**Project Type**: web-service + SPA (monorepo `apps/api`, `apps/web`, `packages/*`).

**Performance Goals**: una llamada HTTP externa por tic horario (≤13/día) más una de relleno cuando hay
huecos; lecturas de `exchange-rate` por índice `(currency, date desc)`, rango ≤400 filas.

**Constraints**: la fuente puede estar caída o no haber publicado el valor del día (lo normal a las 8:00
para el dólar); nunca inventar un valor; ninguna conversión se persiste sin confirmación; ocultar saldos
debe cubrir los equivalentes nuevos.

**Scale/Scope**: 2 monedas × ~365 filas/año, datos globales; ~8 pantallas/paneles web tocados.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio                          | Estado | Notas                                                                                                                                                                                                                                  |
| ---------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Money Precision                 | ✅     | `Decimal(18,4)`; `convertAmount` único en `@finance/money`, redondea a `currencyScale`; sin floats. Los dos montos de un pago/traspaso nunca se comparan ni se re-derivan en servidor.                                                  |
| II. Aislamiento por usuario        | ✅     | `exchange-rate` es referencia global (sin `userId`), solo lectura vía HTTP; escritura solo por comando `scope: "system"` nombrado. Pago/prepago/traspaso conservan la verificación de `fromAccountId` propia (`findById(userId, …)`).   |
| III. Paridad i18n                  | ✅     | Claves nuevas en es/en: `exchangeRates.*`, `accounts.pay.*` (USD), `errors.*`; `parity.test.ts` lo exige.                                                                                                                              |
| IV. TDD                            | ✅     | Tareas con tests-primero por historia; lógica financiera con unit tests.                                                                                                                                                               |
| V. SDD + memoria viva              | ✅     | Constitución (enmienda a la regla "sin conversión", cuenta de table-domains 30) + CLAUDE.md al cerrar.                                                                                                                                 |
| VI. DDD + CQRS, una tabla = dominio | ✅     | Nuevo dominio `exchange-rate` con 4 capas; `*.data.module.ts` hoja + módulo; el cron es un disparador delgado. `credit-statement` compone puertos existentes, sin `include` cruzado.                                                   |
| VII. Idempotencia de escrituras    | ✅     | Cron: forma (b), `@@unique(currency,date)` + upsert. Pago/prepago: ya `BaseIdempotentCommandHandler` con `Idempotency-Key`; el prepago relee con lock. Lecturas y sugerencias no escriben.                                              |
| VIII. Identificadores              | ✅     | `id` UUID v7 (`@default(uuid(7))`); `(currency, date)` es clave de negocio, no PK.                                                                                                                                                      |

**Data gates**

- [x] Toda entidad nueva declara formato de identificador: `ExchangeRate.id` UUID v7.
- [x] Todo endpoint de escritura nuevo declara su idempotencia: ninguno nuevo; `pay`/`prepay` ya la tienen; el comando de sistema usa forma (b).
- [x] Toda FK desde el cuerpo declara su verificación de ownership: `fromAccountId` en pay/prepay (existente, `AccountNotFoundError` si no es propia); sin FK nueva.

**Re-check post-diseño**: sin violaciones. La única tensión es de redacción, no de código: la regla vigente
"la app no convierte" se enmienda a "puede sugerir; nunca compara ni valida entre monedas" (R13).

## Pendiente de aprobación

1. **CLF en "≈ todo en CLP (estimado)"** (FR-016 hoy dice solo USD). Propuesta: incluir también cuentas/deudas
   en UF usando su valor registrado; si no, el total omitiría su saldo o tendría que ocultarse. Requiere
   ajustar FR-016 y la Assumption "la UF no se usa para sugerir" (sigue siendo cierto: solo entra en este total).
2. **Alcance absorbido de 028**: US2 + prepago USD entran; 028 US3 no.

## Project Structure

### Documentation (this feature)

```text
specs/030-exchange-rates/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/api.md     # Phase 1
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/
├── money/src/                       # convertAmount (+ tests)
└── contracts/src/
    ├── exchange-rates/index.ts      # exchangeRateSchema, rateOn, list query/response (+ tests)
    └── accounts/index.ts            # prepayCreditStatementSchema.chargedAmount

apps/api/
├── prisma/schema.prisma             # model ExchangeRate; (seed: rates for the demo)
├── src/domains/exchange-rate/
│   ├── domain/                      # exchange-rate.entity.ts, ports/exchange-rate.repository.port.ts, errors.ts
│   ├── application/
│   │   ├── commands/record-exchange-rates.{command,handler}.ts   # scope: "system"
│   │   ├── queries/list-exchange-rates.{query,handler}.ts
│   │   └── exchange-rate-source.ts  # MindicadorSource (fetch + timeout) behind a port
│   ├── infrastructure/prisma-exchange-rate.repository.ts
│   ├── presentation/exchange-rates.controller.ts
│   ├── exchange-rate.data.module.ts
│   └── exchange-rate.module.ts
├── src/infra/cron/exchange-rate.cron.ts          # thin trigger, 08:00–20:00 America/Santiago
├── src/domains/credit-statement/application/commands/
│   ├── pay-credit-statement.{command,handler}.ts          # chargedAmount, settlement income, lock re-read
│   ├── prepay-open-period.{command,handler}.ts            # foreign period branch
│   └── update-statement-payment.{command,handler}.ts      # chargedAmount (028 R13)
├── src/domains/transaction/application/commands/{update,remove}-transaction.handler.ts   # TRANSACTION_LINKED_TO_STATEMENT
└── test/{unit,integration,e2e}/domains/{exchange-rate,credit-statement,transaction}/

apps/web/src/
├── domains/exchange-rates/{api,hooks,components,routes}/    # ExchangeRatesRoute, RateChart, RateTable
├── shared/ui/approx-amount.tsx                              # "≈ … · estimado, <fecha>", mask-aware
├── domains/accounts/components/{PayStatementPanel,BillingSection,EditStatementPaymentPanel,AccountVisualCard,AccountCard}.tsx
├── domains/accounts/lib/netWorth.ts                         # estimatedTotalClp
├── domains/transactions/components/{TransferFields,TransactionDetailPanel}.tsx
├── app/{router.tsx,AppLayout.tsx}                           # route + nav item
└── i18n/{es,en}.json
```

**Structure Decision**: mismo monorepo y mismo patrón de dominio-tabla que `ip-geolocation-cache` (tabla
global, comando de sistema, cron delgado) más la lectura HTTP que ese dominio no tiene. Los cambios de
`credit-statement` y `transaction` reutilizan puertos existentes (`CreditStatementLookupPort`,
`TransactionWriterRepositoryPort`, `CategoryLookupPort`).

## Orden de ejecución sugerido (para `tasks.md`)

1. **Fundación**: `convertAmount`, contrato `exchange-rates`, tabla + dominio + fuente + cron + endpoint de lectura.
2. **US1** — historial y pantalla "Tipos de cambio" (depende solo de 1).
3. **028 US2 absorbida** — pago USD con dos montos, solo lectura de movimientos de liquidación, corrección de pago, UI que muestra acciones en períodos de otra moneda.
4. **US2 de 030** — sugerencia en pago, prepago USD (backend + panel).
5. **US3 / US4** — equivalente en cuentas y patrimonio; sugerencia en traspaso (solo web, dependen de 1).
6. **Cierre** — seed, i18n, enmienda de constitución y CLAUDE.md, validación `quickstart.md`.

## Complexity Tracking

Sin violaciones de constitución que justificar.

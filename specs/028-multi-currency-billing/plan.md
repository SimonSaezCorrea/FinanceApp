# Implementation Plan: Facturación separada por moneda en tarjetas de crédito

**Branch**: `028-multi-currency-billing` | **Date**: 2026-09-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-multi-currency-billing/spec.md`

## Summary

Un período de facturación (`CreditStatement`) pasa a tener **moneda**. Una cuenta de tarjeta de
crédito con topes en otras monedas mantiene un período abierto por moneda, todos anclados al mismo
`periodStart` y cerrados el mismo día. Los cargos en otra moneda se enlazan al período de su moneda.
Pagar una facturación en otra moneda desde una cuenta en pesos pide dos montos (liquidado y
debitado) y crea dos movimientos: el gasto en la cuenta de origen y un **ingreso de liquidación** en
la cuenta de crédito, con la tarjeta dueña del tope, que baja su uso (regla de `MovementPolicy` de la
027). El **traspaso** de una facturación vencida liquida el saldo en su moneda con ese mismo ingreso
y carga el monto en pesos que escribe el usuario como cargo del emisor al período en pesos abierto;
queda en estado propio `TRANSFERRED` y se puede deshacer mientras el período en pesos no se haya
liquidado. Detalle y alternativas en [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5, Node 20

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs`, Prisma 7 (adapter-pg), React 19 + TanStack Query, zod (`@finance/contracts`), `@finance/money` (decimal.js). **Sin dependencias nuevas.**

**Storage**: PostgreSQL 16 — columnas nuevas en `credit-statement` y `transaction`, fila nueva de sistema en `category`. Sin migración (`db push` + `db:seed`).

**Testing**: Vitest (unit con puertos falsos, integration contra Postgres real, e2e HTTP), Vitest + Testing Library en web.

**Target Platform**: API Node + SPA en navegador.

**Project Type**: monorepo web (apps/api + apps/web + packages/contracts).

**Performance Goals**: las operaciones de pago/traspaso son una transacción de < 10 escrituras; sin objetivos nuevos.

**Constraints**: sin tipo de cambio; dinero solo con decimal.js / `Prisma.Decimal`; toda escritura que mueve dinero idempotente (forma c).

**Scale/Scope**: 1–2 monedas por cuenta de crédito; decenas de períodos por cuenta.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Money Precision** ✅ — montos en `moneyString`/decimal.js; los dos montos de un pago en otra moneda nunca se comparan ni convierten. El faltante de un pago en otra moneda usa el MISMO mecanismo de arrastre (`carriedOverAmount`) hacia el período de su moneda, no uno nuevo. La confirmación del traspaso y de deshacerlo muestra el efecto calculado por la misma función que lo aplica (`canTransferStatement` + `remainingFor`).
- **II. Per-User Isolation** ✅ — todo lookup por `userId`; `fromAccountId` ya se verifica por ownership en `PayCreditStatementHandler.loadContext`; el traspaso no recibe FKs en el cuerpo.
- **III. i18n Parity** ✅ — claves nuevas en es y en (estado Traspasada, panel de traspaso, errores nuevos, origen de movimientos, categoría).
- **IV. TDD** ✅ — tests primero para el agregado (estado TRANSFERRED, `transferTowards`/`undoTransfer`), `canTransferStatement`, handlers, adaptador y e2e.
- **V. SDD & Living Memory** ✅ — este ciclo; constitución + CLAUDE.md al cierre.
- **VI. DDD + CQRS, una tabla = un dominio** ✅ — todo vive en `credit-statement` (agregado, comandos `TransferStatement`/`UndoTransfer`), `transaction` (columna + exclusiones, a través de su propio adaptador) y `category` (seed). Las escrituras cruzadas usan los `*WithTx` de cada puerto dentro de un `prisma.$transaction` del handler, como `PayCreditStatementHandler` hoy.
- **VII. Idempotencia** ✅ — ver gates.
- **VIII. Identificadores** ✅ — ver gates.

**Data gates (always applicable — see Principles II, VII and VIII):**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de Identificadores. → No hay entidades nuevas; los ids nuevos (movimientos de liquidación y de traspaso) se acuñan con `generateRowId()` (UUID v7) porque se referencian antes del insert.
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface. → `POST .../transfer` y `DELETE .../transfer`: forma (c), `Idempotency-Key` + `BaseIdempotentCommandHandler`, operaciones `creditStatement.transfer` / `creditStatement.undoTransfer`. `POST .../pay` y `PATCH .../payment` siguen en su forma actual.
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership. → Solo `fromAccountId` (pago), verificado en `loadContext` por `accountRepo.findById(userId, …)` (sin cambios).

## Project Structure

### Documentation (this feature)

```text
specs/028-multi-currency-billing/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/
├── accounts/index.ts            # creditStatementSchema (+currency, TRANSFERRED, transfer*), payStatementSchema (+chargedAmount),
│                                # transferStatementSchema, isSettled, canTransferStatement
└── transactions/index.ts        # settlesStatementId, transferStatement*, sourceOf (+STATEMENT_SETTLEMENT, CURRENCY_TRANSFER)

apps/api/prisma/schema.prisma    # CreditStatement.currency/transfer*/settlementTransactionId, Transaction.settlesStatementId
apps/api/prisma/seed.ts          # categoría CURRENCY_TRANSFER; períodos del seed con currency

apps/api/src/domains/credit-statement/
├── domain/credit-statement.aggregate.ts       # currency, transferTowards, undoTransfer, state
├── domain/states/transferred-state.ts         # NUEVO
├── domain/errors.ts                           # STATEMENT_NOT_TRANSFERABLE, STATEMENT_NOT_TRANSFERRED, TRANSFER_ALREADY_BILLED,
│                                              # STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS
├── domain/ports/*.ts                          # findOpenForAccount/findOrCreate* por moneda; lookup transferInfoFor
├── application/commands/generate-statements.handler.ts   # cierra todas las monedas con el mismo límite
├── application/commands/pay-credit-statement.handler.ts  # dos montos, liquidación
├── application/commands/transfer-statement.{command,handler}.ts       # NUEVO
├── application/commands/undo-transfer-statement.{command,handler}.ts  # NUEVO
├── application/commands/update-statement-payment.handler.ts           # chargedAmount
├── application/commands/sync-statement.handler.ts        # filtra moneda
├── application/statement-dto.mapper.ts                   # currency, canTransfer, transfer*
├── infrastructure/prisma-credit-statement.repository.ts
└── presentation/credit-statements.controller.ts          # POST/DELETE .../transfer

apps/api/src/domains/transaction/
├── application/commands/{create,update,remove}-transaction.handler.ts  # enlazar por moneda; solo lectura
├── infrastructure/prisma-transaction-*.repository.ts     # netForPeriod/relink por moneda, excluir settlesStatementId
└── domain/...                                            # TransactionLinkedToStatementError

apps/api/src/domains/bank-account/application/commands/update-card.handler.ts  # CARD_LIMIT_HAS_DEBT
apps/api/src/domains/import/...                           # filas en otra moneda → período de su moneda

apps/web/src/domains/accounts/
├── components/BillingSection.tsx          # agrupado por moneda, estado Traspasada, acción traspasar/deshacer
├── components/PayStatementPanel.tsx       # segundo monto cuando las monedas difieren
├── components/TransferStatementPanel.tsx  # NUEVO
└── hooks/useAccounts.ts                   # mutaciones transfer/undoTransfer
apps/web/src/domains/transactions/components/TransactionDetailPanel.tsx  # orígenes nuevos, solo lectura
apps/web/src/i18n/{es,en}.json

apps/api/test/{unit,integration,e2e}/domains/credit-statement/…  # tests nuevos
```

**Structure Decision**: monorepo existente; el cambio vive en el dominio `credit-statement` con
toques acotados a `transaction`, `bank-account` (regla del tope), `import` y `category` (seed).

## Complexity Tracking

No hay violaciones que justificar.

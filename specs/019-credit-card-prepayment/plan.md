# Implementation Plan: Prepago de tarjeta de crédito (período abierto)

**Branch**: `019-credit-card-prepayment` | **Date**: 2026-09-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-credit-card-prepayment/spec.md`

## Summary

Permitir abonar (una o más veces) contra el período de facturación actualmente
OPEN de una cuenta CREDIT_CARD, sin esperar a que cierre. Técnicamente: `CreditStatement`
gana un acumulador `prepaidAmount` que `totalFor()` resta del total del período
(así el período OPEN y una eventual facturación PENDING derivada ya muestran la
deuda neta sin ningún job adicional); un comando nuevo (`PrepayOpenPeriodCommand`,
idempotente, mismo patrón que `PayCreditStatementHandler`) crea el abono como un
`EXPENSE` real en la cuenta de origen y decrementa `creditUsed` de la tarjeta, todo
en una transacción; y el movimiento creado queda editable/eliminable como
cualquier otro — su reversión (incluso si el período ya cerró desde entonces)
reutiliza el mismo mecanismo de reconciliación que `.../sync` ya usa
(`CreditStatement.syncAmount`). En el frontend, `TransactionFormPanel` gana un
tercer modo "Prepagar" (junto a "Gasto"), exclusivo de cuentas CREDIT_CARD, con
el mismo look que el ya existente `PayStatementPanel`.

## Technical Context

**Language/Version**: TypeScript 5, Node 20 (workspace ya fijado, ver `CLAUDE.md`)

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs` (backend), React 19 + TanStack Query (frontend), Prisma 7 / PostgreSQL, `@finance/money` (decimal.js), zod (`@finance/contracts`) — todas ya en uso, ninguna nueva.

**Storage**: PostgreSQL vía Prisma — una columna nueva en `CreditStatement` (`prepaidAmount`) y dos en `Transaction` (`prepaymentStatementId`, `prepaymentAccountId`). Sin `prisma/migrations` (este repo usa `db push`, ver `CLAUDE.md`).

**Testing**: Vitest — `apps/api/test/{unit,integration,e2e}` espejando `src/domains/credit-statement` y `src/domains/transaction` (aggregate/state tests unitarios; handler tests de integración contra Postgres real; flujo HTTP en e2e); `apps/web` con su suite Vitest existente para `TransactionFormPanel`.

**Target Platform**: Web (SPA + API HTTP), sin cambios de plataforma.

**Project Type**: Monorepo pnpm/Turborepo existente (`apps/api`, `apps/web`, `packages/contracts`, `packages/money`) — feature se implementa DENTRO de dominios ya existentes (`credit-statement`, `transaction`), no crea un dominio nuevo.

**Performance Goals**: Sin objetivo nuevo — mismo orden de magnitud que pagar una facturación hoy (una transacción Postgres, sub-100ms típico en dev).

**Constraints**: Debe mantener las invariantes ya documentadas del pool de crédito (Σ ownUsed = creditUsed, un solo adapter por tabla, idempotencia obligatoria en toda escritura de dinero — Constitución VI/VII).

**Scale/Scope**: Cambios acotados a 2 dominios-tabla existentes (`credit-statement`, `transaction`) + 1 componente de frontend (`TransactionFormPanel`) + su contrato compartido. No se crea ningún dominio nuevo.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Data gates (always applicable — see Principles II, VII y VIII):**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de Identificadores.
      → No hay entidad nueva (tabla). `prepaymentStatementId`/`prepaymentAccountId` son columnas `rowId` (UUID v7) sobre `Transaction`, igual que `debtId`/`installmentPlanId`; `prepaidAmount` es un `Decimal`, no un identificador.
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface.
      → `POST .../prepay` usa la forma (c): `Idempotency-Key` del cliente + `IdempotencyRecord` (`@@unique([userId, key])`), extendiendo `BaseIdempotentCommandHandler` — mismo mecanismo que `.../pay`. Los cambios a `PATCH/DELETE /transactions/:id` (reversión de un prepago) NO son un endpoint nuevo — heredan la garantía que esos dos endpoints ya tienen hoy (no están bajo el paraguas de idempotencia por-clave, igual que hoy: son operaciones idempotentes por naturaleza a nivel de recurso — editar/borrar el mismo id repetidamente converge, no duplica).
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership.
      → `fromAccountId` (body de `.../prepay`) se verifica igual que `PayCreditStatementHandler` ya hace hoy con el mismo campo: `BankAccountRepositoryPort.findById(userId, fromAccountId)` dentro de `loadContext` (404/`ACCOUNT_NOT_FOUND` si no es del usuario). `id`/`statementId` (path params) se verifican igual que en `pay`/`sync` ya existentes.

**Gate adicional específico de esta feature (no genérico, pero crítico — ver `research.md` R5):**

- [x] Todo endpoint/handler que hace escritura CROSS-AGREGADO declara en qué transacción Prisma corre y por qué no es una violación del principio de un-agregado-por-transacción.
      → `PrepayOpenPeriodHandler` (nuevo): un solo `prisma.$transaction` para `Transaction` + `CreditStatement` + `BankAccount`, exactamente el mismo patrón ya documentado y aceptado para `PayCreditStatementHandler`. `UpdateTransactionHandler`/`RemoveTransactionHandler` (existentes): SOLO cuando el movimiento tiene `prepaymentStatementId`, abren la misma clase de `$transaction` cruzada (hoy no lo hacen para ningún otro caso — ver Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/019-credit-card-prepayment/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── prepay-open-period.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

Monorepo existente — ningún directorio nuevo de primer nivel. Los cambios caen dentro de los dominios ya existentes:

```text
apps/api/src/domains/credit-statement/
├── domain/
│   ├── credit-statement.aggregate.ts        # totalFor() cambia; changePrepayment() nuevo
│   ├── errors.ts                            # StatementNotOpenError nuevo
│   └── states/
│       ├── credit-statement-state.ts        # canPrepay() nuevo en la interfaz
│       ├── open-state.ts                    # canPrepay() → true
│       ├── pending-state.ts                 # canPrepay() → false
│       ├── partially-paid-state.ts          # canPrepay() → false
│       └── paid-state.ts                    # canPrepay() → false
├── application/commands/
│   ├── prepay-open-period.command.ts        # nuevo
│   └── prepay-open-period.handler.ts        # nuevo (mismo patrón que pay-credit-statement.handler.ts)
├── infrastructure/
│   └── prisma-credit-statement.repository.ts # persiste prepaidAmount
└── presentation/
    └── credit-statements.controller.ts       # POST .../prepay

apps/api/src/domains/transaction/
├── domain/
│   └── ports/transaction-writer.repository.port.ts  # TransactionPlan gana los 2 campos
├── application/commands/
│   ├── update-transaction.handler.ts        # reversión cross-agregado cuando hay prepaymentStatementId
│   └── remove-transaction.handler.ts        # idem
└── infrastructure/
    └── prisma-transaction-writer.repository.ts  # escribe los 2 campos nuevos

apps/api/prisma/schema.prisma                # +3 columnas (CreditStatement.prepaidAmount, Transaction.prepaymentStatementId/prepaymentAccountId)

packages/contracts/src/
├── accounts/index.ts                        # CreditStatement.prepaidAmount, prepayCreditStatementSchema
└── transactions/index.ts                    # 2 campos nuevos, sourceOf() gana CREDIT_CARD_PREPAYMENT

apps/web/src/domains/
├── transactions/components/
│   ├── TransactionFormPanel.tsx             # modo "PREPAY", nuevo layout de campos
│   └── TransactionDetailPanel.tsx           # nueva fila de origen + link a facturación
└── accounts/components/
    └── BillingSection.tsx                   # el botón "Pagar" del período OPEN se reemplaza por el flujo de prepago
```

**Structure Decision**: Sin estructura nueva — feature vive enteramente dentro de los dominios-tabla `credit-statement` y `transaction` ya existentes (Constitución VI, una tabla = un dominio; ninguna tabla nueva, así que ningún dominio nuevo). El único componente de frontend nuevo es un modo adicional de un formulario ya existente.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| `UpdateTransactionHandler`/`RemoveTransactionHandler` pasan a abrir una transacción Prisma cross-agregado (`transaction` + `credit-statement` + `bank-account`) SOLO para el caso de un movimiento con `prepaymentStatementId` — hoy ninguno de los dos hace esto para ningún otro caso (delegan todo a `TransactionRepositoryPort.saveUpdate`/`removeWithCreditAdjustment`, que solo tocan `transaction`+`bank-account` vía deltas simples). | El usuario exigió explícitamente (Clarification Q1) que el movimiento de un prepago sea editable/borrable como cualquier otro, con reversión automática — y (Q2) que si el período ya cerró, la facturación generada se corrija sola, sin que el usuario tenga que presionar "Sincronizar pagos". Sin esta transacción cruzada, un borrado dejaría `creditUsed`/`prepaidAmount` desincronizados del movimiento real. | Marcar el movimiento como de solo lectura (como ya se hace con una cuota de instalment) — rechazado explícitamente por el usuario: "esto es totalmente customizable porque son finanzas personales... debe ser capaz de revertir, editar, borrar cualquier cosa que haga". |

## Post-Design Constitution Re-Check

Sin cambios respecto al chequeo inicial — el diseño de Phase 1 (`data-model.md`, `contracts/`) no introdujo ninguna FK, endpoint de escritura, ni entidad que no estuviera ya contemplada arriba. Los tres gates de datos y el gate adicional de transacción-cruzada siguen `[x]`.

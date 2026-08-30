# Implementation Plan: Vista Cuotas — rediseño funcional y pago real de la cuota

**Branch**: `013-installments-redesign` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-installments-redesign/spec.md`

## Summary

La vista Cuotas pasa de una tabla aplanada de cuotas sueltas a **una fila por plan** con detalle,
creación y edición en **panel lateral** (`SidePanel`/`FormSurface surface="panel"`, ya existentes),
en los tres formatos del handoff. El cambio de fondo no es visual: **pagar una cuota registra un
gasto real** en una cuenta, con **arrastre** del faltante a la siguiente cuota impaga — exactamente
el mecanismo que `CreditStatement.carriedOverAmount` ya implementa para la facturación de crédito,
reusado aquí en vez de inventado.

Enfoque técnico, en una línea por decisión:

- **Cuatro columnas nuevas** en `installment-payment` (`paidAmount`, `carriedOverAmount`,
  `transactionId`) y `installment-plan` (`category`, `paymentAccountId`). Ninguna tabla nueva.
- **`PayInstallmentHandler` gana un `persist()` transaccional** que mirror-ea
  `PayCreditStatementHandler`: crear EXPENSE + mover saldo + marcar cuota + arrastrar faltante, todo
  en un `prisma.$transaction`. `UnpayInstallmentHandler` lo revierte igual de atómicamente.
- **La previsualización usa la MISMA función que el servidor** (`equalPrincipalSchedule` de
  `@finance/money`, que el web ya puede importar). Cero matemática duplicada, que es la única forma
  honesta de cumplir FR-042.
- **El ícono se reutiliza, no se recrea**: `categoryIcons.ts` + `CategoryIcon` se mueven de
  `domains/transactions` a `shared/`, y ambos dominios consumen el mismo mapa.
- **Sin migración de datos**: este repo no tiene carpeta `prisma/migrations`; el flujo es
  `pnpm db:push` + `pnpm db:seed`.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs` (API), Prisma 7 + `@prisma/adapter-pg`, React 19
+ Vite + TanStack Query + react-router v8 (web), zod (`@finance/contracts`), `decimal.js`
(`@finance/money`), Tailwind + Radix (`shared/ui`), Lucide, sonner

**Storage**: PostgreSQL. Tablas tocadas: `installment-plan`, `installment-payment`, `transaction`
(escritura desde otro dominio vía puerto), `bank-account` (delta de saldo). Sin tablas nuevas.

**Testing**: Vitest. `apps/api/test/{unit,integration,e2e}` espejando `src/`; `apps/web` con Testing
Library. `test:unit` corre con cero conexiones a base de datos (puertos falsos).

**Target Platform**: SPA en navegador + API HTTP

**Project Type**: Monorepo web (pnpm + Turborepo): `apps/api`, `apps/web`, `packages/*`

**Performance Goals**: la vista carga todos los planes del usuario en una llamada (decenas de filas,
no miles); las cuatro cifras del encabezado se derivan en el cliente sobre esa misma lista, sin
consulta adicional. No se introduce paginación: no hay evidencia de que haga falta y añadirla
complicaría el cálculo de los indicadores, que necesitan el conjunto completo.

**Constraints**: dinero siempre como string decimal en el borde y `Decimal` en el cálculo; sin
conversión de moneda (no hay fuente de tipo de cambio); breakpoints sólo desde
`apps/web/breakpoints.ts`; toda etiqueta en es + en.

**Scale/Scope**: 1 vista rediseñada, ~5 componentes web nuevos y ~4 reescritos, 2 comandos de API
reescritos, 1 puerto ampliado, 5 columnas nuevas, 0 tablas nuevas, 0 dependencias nuevas.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Constitución v1.45.0.

| Principio | Cómo lo cumple este plan | Estado |
| --- | --- | --- |
| **I. Money Precision** (NON-NEGOTIABLE) | `paidAmount`/`carriedOverAmount` son `Decimal(18,4)` en Prisma y `moneyString` en el contrato. Toda la aritmética de arrastre pasa por `@finance/money`; la previsualización del cliente usa `equalPrincipalSchedule`, no división en `number`. | PASS |
| **II. Per-User Data Isolation** (NON-NEGOTIABLE) | Todo comando/consulta lleva `userId`; el repositorio ya filtra por él. La cuenta de pago y la tarjeta se resuelven por puertos que también reciben `userId` (`TRANSFER_ACCOUNT_NOT_FOUND` es el precedente: cuenta ajena = no encontrada, nunca 403). | PASS |
| **III. i18n Parity** (NON-NEGOTIABLE) | Cada etiqueta nueva entra en `es.json` y `en.json`; `src/i18n/parity.test.ts` lo verifica como test, no por disciplina. Los códigos de error nuevos se mapean en ambos idiomas. | PASS |
| **IV. Test-First / TDD** (NON-NEGOTIABLE) | El orden de `tasks.md` pondrá el test antes de la implementación en cada unidad. El arrastre es aritmética pura sobre el agregado ⇒ se prueba en `test:unit` con puertos falsos, sin base de datos; la atomicidad del pago en `test:integration` contra la base real (incluida la garantía de rollback), y el flujo HTTP en `test:e2e`. | PASS |
| **V. SDD & Living Memory** (NON-NEGOTIABLE) | Este ciclo va completo: spec → clarify → plan → tasks → analyze → implement, y cierra sincronizando `constitution.md` (nuevo principio de datos derivados vs. persistidos, si procede) y `CLAUDE.md`. | PASS |
| **VI. Backend DDD + CQRS, una tabla = un dominio** | No se crea dominio nuevo. `installment-plan` sigue siendo la raíz del agregado e `installment-payment` su entidad, escrita sólo a través de él. El gasto NO se escribe con `prisma.transaction` desde este dominio: se compone `TransactionWriterRepositoryPort`, igual que hace `credit-statement`. El saldo se mueve con `BankAccountRepositoryPort.incrementBalanceWithTx`. | PASS |
| **Scope is data, not code** (v1.45.0) | Esta feature no toca catálogo ni países. La moneda del plan y la de la cuenta se muestran por separado justamente porque no existe tabla de tipo de cambio que se pueda rellenar con honestidad. | PASS |

**Una desviación, ya precedente en el repo** (ver Complexity Tracking): pagar una cuota escribe
tres agregados en una sola transacción de base de datos.

## Project Structure

### Documentation (this feature)

```text
specs/013-installments-redesign/
├── plan.md              # Este archivo
├── research.md          # Fase 0 — decisiones técnicas y alternativas descartadas
├── data-model.md        # Fase 1 — columnas nuevas, invariantes, transiciones
├── quickstart.md        # Fase 1 — cómo validar la feature de punta a punta
├── contracts/
│   └── installments.md  # Fase 1 — delta del contrato zod + endpoints + códigos de error
├── checklists/
│   └── requirements.md  # Calidad de la spec (ya creado)
└── tasks.md             # Fase 2 — lo genera /speckit-tasks, NO este comando
```

### Source Code (repository root)

```text
packages/
├── contracts/src/installments/index.ts        # + category, paymentAccountId, paidAmount,
│                                              #   carriedOverAmount, transactionId, dueAmount,
│                                              #   payInstallmentSchema, planStatus
└── money/src/                                 # equalPrincipalSchedule: sin cambios, ahora
                                               #   también lo consume el web

apps/api/
├── prisma/schema.prisma                       # 5 columnas nuevas (2 modelos), 0 tablas
├── prisma/seed.ts                             # planes con categoría, cuenta de pago y un
│                                              #   pago parcial que demuestra el arrastre
├── src/domains/installment-plan/
│   ├── domain/
│   │   ├── installment-plan.aggregate.ts      # payInstallment/unpayInstallment con arrastre
│   │   ├── installment-carry-over.ts          # NUEVO — aritmética pura del arrastre
│   │   ├── errors.ts                          # + INSTALLMENT_PAYMENT_ALREADY_PAID,
│   │   │                                      #   INSTALLMENT_PAYMENT_ACCOUNT_REQUIRED,
│   │   │                                      #   INSTALLMENT_CARD_IS_CREDIT, INVALID_PAYMENT_AMOUNT
│   │   └── ports/installment-plan.repository.port.ts
│   ├── application/commands/
│   │   ├── pay-installment.{command,handler}.ts    # reescrito: persist() transaccional
│   │   ├── unpay-installment.{command,handler}.ts  # reescrito: revierte gasto + saldo + arrastre
│   │   └── remove-installment-plan.handler.ts      # reescrito: borra gastos, restituye saldos
│   │                                               #   y borra el cargo financiero (FR-050a)
│   ├── application/queries/get-installment-plan.handler.ts  # + deletionImpact (FR-050b)
│   ├── infrastructure/prisma-installment-plan.repository.ts
│   └── presentation/installments.controller.ts     # POST .../payments/:sequence/pay (body nuevo)
├── src/domains/installment-payment/
│   ├── domain/ports/installment-payment-lookup.port.ts   # NUEVO — isLinkedToPayment (FR-028a)
│   └── infrastructure/prisma-installment-payment.repository.ts
├── src/domains/card-account/domain/ports/card-account.repository.port.ts  # + kindForCard (R7)
├── src/domains/transaction/
│   ├── domain/ports/transaction-writer.repository.port.ts  # + deleteWithTx, + installmentPlanId
│   ├── application/commands/update-transaction.handler.ts  # rechaza el movimiento vinculado
│   ├── application/commands/remove-transaction.handler.ts  #   a una cuota (FR-028a)
│   └── infrastructure/prisma-transaction.repository.ts
└── test/{unit,integration,e2e}/domains/installment-plan/

apps/web/src/
├── shared/
│   ├── lib/categoryIcons.ts                   # MOVIDO desde domains/transactions/lib
│   └── ui/category-icon.tsx                   # MOVIDO desde domains/transactions/components
└── domains/installments/
    ├── api/installmentsApi.ts
    ├── hooks/{useInstallments,useInstallmentMutations}.ts
    ├── lib/
    │   ├── installmentMetrics.ts              # estado del plan, KPIs, arrastre, restante
    │   └── schedulePreview.ts                 # NUEVO — envoltorio de equalPrincipalSchedule
    ├── components/
    │   ├── InstallmentPlanTable.tsx           # NUEVO — una fila = un plan (escritorio)
    │   ├── InstallmentPlanList.tsx            # NUEVO — tarjetas (tablet/móvil)
    │   ├── InstallmentKpiStrip.tsx            # reescrito: 4 indicadores
    │   ├── InstallmentDetailPanel.tsx         # NUEVO — detalle + lista de cuotas
    │   ├── InstallmentFormPanel.tsx           # NUEVO — crear/editar con previsualización
    │   ├── SchedulePreview.tsx                # NUEVO — el bloque «así queda el plan»
    │   ├── PayInstallmentPanel.tsx            # NUEVO — formulario de pago prellenado
    │   ├── ImmutableFieldsNotice.tsx          # NUEVO — lo inmutable, visible
    │   └── (InstallmentPaymentTable.tsx, InstallmentTable.tsx, InstallmentPlanCard.tsx,
    │        InstallmentCreateModal.tsx → RETIRADOS)
    └── routes/InstallmentsRoute.tsx           # reescrito
```

**Structure Decision**: monorepo existente, sin carpetas nuevas de primer nivel. El backend conserva
sus dos dominios-tabla (`installment-plan`, `installment-payment`) y las cuatro capas DDD; el
frontend conserva `domains/installments` con su estructura `api/hooks/components/lib/routes`. Lo
único que cruza una frontera es el mapa de íconos, que **por eso** se promueve a `shared/`: un
dominio web importando componentes de otro dominio web es la clase de atajo que `check:boundaries`
existe para evitar.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Pagar una cuota escribe **tres agregados** (`InstallmentPayment`, `Transaction`, `BankAccount`) en un solo `prisma.$transaction` | Un pago que marque la cuota pero falle al crear el gasto —o que cree el gasto sin mover el saldo— deja los libros descuadrados sin forma de detectarlo. La atomicidad no es una optimización aquí, es la corrección | Un agregado por transacción obligaría a un proceso de compensación (saga) para un caso que ocurre en un solo request y contra una sola base de datos. Es exactamente la excepción pragmática que la constitución ya documenta y que `PayCreditStatementHandler` ya ejerce; este plan la copia en vez de abrir una segunda forma de resolverlo |
| El **arrastre se persiste** (`carriedOverAmount`) en vez de derivarse en lectura | Derivarlo exigiría recorrer las cuotas en orden en cada lectura y, aun así, no distinguiría un faltante arrastrado de un monto programado distinto. Persistirlo es lo que hace que deshacer un pago pueda revertir exactamente lo que ese pago provocó | Ya se rechazó el mismo atajo en facturación: `CreditStatement.carriedOverAmount` es persistido por esta misma razón. Derivar aquí y persistir allá sería incoherente |
| `TransactionWriterRepositoryPort` gana `deleteWithTx` | Deshacer un pago debe borrar el gasto que creó, dentro de la misma transacción que restituye el saldo | La alternativa (dejar el gasto huérfano, o borrarlo fuera de la transacción) rompe la reversibilidad que exige FR-024 |
| **Eliminar un plan** escribe también varios agregados en un solo `$transaction` (N gastos + los saldos de las cuentas implicadas + el cargo financiero + el plan) | FR-050a exige que borrar un plan revierta todo su historial. Un borrado a medias —plan borrado, gastos vivos, o saldos sin restituir— deja al usuario con dinero fantasma y sin ninguna vía de arreglarlo desde la aplicación | Borrar el plan y limpiar después, o dejar los gastos huérfanos, fueron las dos alternativas planteadas al usuario; eligió la reversión completa. Ejecutada por pasos, un fallo intermedio produce exactamente el descuadre que la feature venía a eliminar |
| El dominio `transaction` consulta un dato de `installment-payment` antes de editar o borrar un movimiento | FR-028a prohíbe modificar desde Movimientos un gasto que respalda una cuota; el dominio que ejecuta la acción es el único sitio donde se puede impedir | Un `include` entre tablas violaría "una tabla = un adapter"; duplicar la columna en `transaction` crearía un dato que puede desincronizarse. Un puerto de sólo lectura es el mismo recurso que el resto del repositorio ya usa para cruzar dominios |

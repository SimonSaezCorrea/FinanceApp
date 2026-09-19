# Implementation Plan: Personalización financiera del perfil

**Branch**: `020-profile-financial-settings` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-profile-financial-settings/spec.md`

## Summary

Reducir la sección "Personalización financiera" del perfil a solo los dos controles que aportan
valor real, e implementarlos de verdad. Se elimina por completo (columna, contrato, endpoint, UI)
"Inicio del ciclo mensual" (`billingCycleStartDay`), "Presupuesto mensual objetivo"
(`monthlyBudgetTarget`) y el switch decorativo "Redondeo para ahorro" (nunca persistía). Se
implementa "Monedas extra" (`extraCurrencies`) acotando el universo de opciones de **todo**
selector de moneda de la app a `preferredCurrency + extraCurrencies` del usuario logueado —
colapsando a un valor estático cuando no hay extras — y bloqueando en el backend la eliminación de
una moneda extra mientras algún registro del usuario la esté usando. Se implementa "Ocultar
saldos" (`hideBalances`) extendiendo el componente `MaskedAmount` (hoy sin capacidad de revelar) a
un toggle tipo switch independiente por monto, y ampliando su cobertura a Panel, saldo de cuenta y
Ahorros (hoy solo cubre patrimonio neto y tarjetas de cuenta) — sin tocar Movimientos, Deudas,
Recurrentes ni Cuotas/Facturación.

## Technical Context

**Language/Version**: TypeScript 5, Node 20

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs` (apps/api), React 19 + Vite + TanStack Query

- react-router v8 (apps/web), Prisma 7 (`@prisma/adapter-pg`), zod (`@finance/contracts`)

**Storage**: PostgreSQL vía Prisma (`apps/api` es el único dueño de la BD)

**Testing**: Vitest — `test:unit`/`test:integration`/`test:e2e` en `apps/api`, Vitest + Testing
Library en `apps/web`

**Target Platform**: Web (SPA) + API HTTP, ambas apps ya desplegadas; sin plataforma nueva

**Project Type**: Monorepo pnpm/Turborepo existente (`apps/api`, `apps/web`, `packages/contracts`,
`packages/money`) — esta feature no agrega ningún proyecto nuevo

**Performance Goals**: N/A — no hay requisito de performance específico; esta feature no introduce
consultas de alto volumen (el chequeo de "moneda en uso" es sobre datos ya indexados por
`userId`, acotados a un usuario a la vez)

**Constraints**: Ninguna moneda nueva se agrega al catálogo del MVP; no hay conversión de tipo de
cambio; el enmascarado de montos no se extiende más allá de Panel/saldo de cuenta/Ahorros

**Scale/Scope**: Cambio acotado a 1 tabla existente (`User`, se le quitan 2 columnas), 8 dominios-
tabla existentes ganan un puerto de solo lectura nuevo cada uno (comprobación de "moneda en uso"),
y ~9 componentes de frontend se centralizan sobre un selector de moneda compartido nuevo

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Data gates (always applicable — see Principles II, VII y VIII):**

- [x] Toda entidad nueva declara formato de identificador conforme al principio de Identificadores.
      → No se crea ninguna tabla/entidad nueva. Se eliminan 2 columnas de `User` (dato escalar, no
      identificador). El chequeo de "moneda en uso" no introduce ningún id nuevo — reutiliza
      `userId`/`currency` ya existentes en 8 tablas.
- [x] Todo endpoint de escritura nuevo declara cuál de las tres formas de idempotencia satisface.
      → No se agrega ningún endpoint de escritura nuevo. `PATCH /auth/me/preferences` ya existe y
      no mueve dinero ni cupo ni conteo de cuotas (Principio VII aplica solo a escrituras que
      mueven saldo/cupo/instalments); el patch de preferencias sigue sin necesitar el mecanismo de
      idempotencia de dos fases. La única escritura de dominio nueva (rechazar quitar una moneda en
      uso) es una validación sobre ese mismo endpoint existente, no una escritura adicional.
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership.
      → `extraCurrencies` es un array de códigos ISO de moneda (`currencyCodeSchema`), no una FK a
      un registro de otro usuario — no aplica verificación de ownership. El chequeo de "en uso" es
      lo opuesto de una FK entrante: es una consulta de solo lectura hacia adentro (¿el propio
      usuario tiene registros con esta moneda?), resuelta con los mismos `*LookupPort` de patrón ya
      establecido (`BankAccountLookupPort.accountOwned`), nunca persistiendo una referencia nueva.

## Project Structure

### Documentation (this feature)

```text
specs/020-profile-financial-settings/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── preferences-and-currency.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Monorepo existente — no se crea ningún proyecto nuevo. Estructura afectada:

```text
apps/api/prisma/schema.prisma                                    # quitar 2 columnas de User

apps/api/src/domains/user/
├── domain/user.aggregate.ts                                     # quitar 2 branches del patch
├── application/commands/update-preferences.handler.ts           # agregar chequeo "moneda en uso"
├── infrastructure/prisma-user.repository.ts                     # quitar 2 columnas del mapeo
└── user.module.ts                                                # importar 8 data modules nuevos

apps/api/src/domains/{debt,recurring-expense}/
└── <dominio>.data.module.ts                                       # leaf nuevo (no existía — ver
                                                                     # Constitution Check / analyze)

apps/api/src/domains/{bank-account,transaction,installment-plan,
  debt,savings-goal,savings-entry,recurring-expense,card-limit}/
├── domain/ports/currency-usage-lookup.port.ts                    # puerto nuevo (uno por dominio)
└── infrastructure/prisma-<dominio>-currency-usage-lookup.repository.ts  # adapter nuevo

packages/contracts/src/auth/index.ts                              # quitar 2 campos del schema

apps/web/src/domains/profile/components/
├── FinancialCustomizationSection.tsx                             # quitar 3 controles, ajustar UI
└── MaskedAmount.tsx                                               # agregar toggle de revelado

apps/web/src/domains/reference/
├── hooks/useAllowedCurrencies.ts                                  # hook nuevo (principal+extras)
└── components/CurrencyField.tsx                                   # selector compartido nuevo

apps/web/src/domains/accounts/components/
├── AccountForm.tsx, AccountCreateModal.tsx, CardForm.tsx          # migrar a CurrencyField
apps/web/src/domains/transactions/components/TransactionFormPanel.tsx
apps/web/src/domains/savings/components/SavingsGoalFormPanel.tsx
apps/web/src/domains/recurring/components/RecurringFormPanel.tsx
apps/web/src/domains/installments/components/InstallmentFormPanel.tsx
apps/web/src/domains/debts/components/DebtFormPanel.tsx           # ^ todos migran a CurrencyField

apps/web/src/domains/accounts/routes/AccountDetailRoute.tsx        # envolver saldo en MaskedAmount
apps/web/src/domains/savings/components/
├── SavingsTotalCard.tsx, SavingsGoalRow.tsx, SavingsGoalTable.tsx,
├── SavingsInsightsRail.tsx, SavingsGroupHeader.tsx,
└── SavingsGoalStatusLine.tsx                                      # ^ todos envuelven sus montos

apps/web/src/i18n/{es,en}.json                                     # remover claves obsoletas,
                                                                     # agregar error CURRENCY_IN_USE
```

**Structure Decision**: Se reutiliza la arquitectura existente sin crear proyectos nuevos. El
backend sigue el patrón "una tabla = un dominio" ya establecido (Constitución §VI): el chequeo de
"moneda en uso" se resuelve con 8 puertos de solo lectura nuevos (uno por tabla que tiene columna
`currency`), siguiendo el mismo patrón que `BankAccountLookupPort.accountOwned` — nunca una
consulta cruzada directa desde `user`. El frontend centraliza el patrón repetido de selector de
moneda (hoy duplicado en 8 componentes) en un componente compartido nuevo dentro de
`domains/reference/`, el mismo dominio que ya posee `useCurrencies`.

## Complexity Tracking

> Sin violaciones de la Constitución que requieran justificación — no se llena esta sección.

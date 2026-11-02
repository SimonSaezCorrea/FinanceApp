# Implementation Plan: Cupos por moneda en la cuenta y cambio de tarjeta principal

**Branch**: `039-primary-card-swap` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/039-primary-card-swap/spec.md`

## Summary

Los cupos en otra moneda (USD) dejan de vivir en la tarjeta principal y pasan a la cuenta: tabla nueva
`account-credit-limit` (dominio-tabla propio, entidad del agregado `BankAccount`), con su uso derivado de
todos los movimientos de la cuenta en esa moneda (`STILL_OWED` + arrastre). La principal usa el 100% en
cada moneda y no tiene sub-topes; las adicionales pueden tener sub-topes (`CardLimit`) en cualquier moneda
con cupo de la cuenta y nunca sobre él. Un cargo en otra moneda exige cupo de la cuenta en esa moneda y
nunca suma al cupo en pesos (cierra un hueco actual). Las liquidaciones de facturaciones en otra moneda se
crean sin tarjeta. Sobre ese modelo, cambiar la principal es solo cambiar roles: `make-primary` (forma (a))
y `replace-primary` con `DEACTIVATE`/`DELETE` y reemplazo existente o nuevo (forma (c)), más el rechazo
`PRIMARY_CARD_REPLACEMENT_REQUIRED` en el PATCH/DELETE de la principal. Invariante "exactamente una
principal activa" en el agregado + índice único parcial en la base. Migración expand que suma los topes
existentes en cupos de cuenta sin bajar ningún disponible. Ver [research.md](research.md) R1–R16.

## Technical Context

**Language/Version**: TypeScript, Node 22 (≥ 22.12)

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs`, Prisma 7 (`@prisma/adapter-pg`), zod 4
(`@finance/contracts`), `@finance/money` (`decimal.js`); web: React 19, TanStack Query, react-router 8,
Tailwind. Sin dependencias nuevas.

**Storage**: PostgreSQL 16; migración Prisma nueva `<timestamp>_account_credit_limits` (tabla + datos +
índice único parcial a mano).

**Testing**: Vitest — `apps/api/test/{unit,integration,e2e}`, `apps/web` (jsdom), `packages/contracts`.

**Target Platform**: API en EC2 (Docker), web SPA en Cloudflare Pages.

**Project Type**: monorepo web (api + web + packages).

**Performance Goals**: sin metas nuevas; el uso por moneda se calcula en UN `groupBy` por lote de cuentas
para el listado (igual que `sumsByCard`).

**Constraints**: despliegue sin downtime — la migración es solo expand (no borra filas que el código viejo
lee) y la API acepta el contrato viejo (R10). Sin conversión entre monedas.

**Scale/Scope**: pocas cuentas de crédito por usuario, ≤ 3 monedas (CLP/USD/CLF).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principio                   | Cumplimiento                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Money Precision          | Cupos y usos en `Decimal(18,4)`/`moneyString`; aritmética con `@finance/money`. Sin floats.                                                                                                                                                                                                                                                 |
| II. Aislamiento por usuario | Todo comando lleva `userId`; los adapters filtran por `account.userId`. FK del cuerpo: `replacement.cardId` se verifica como tarjeta de la MISMA cuenta del usuario (`findCardOrThrow` sobre el agregado cargado con `userId`) antes de escribir; `null` del resolver ≠ campo vacío (`PRIMARY_CARD_INVALID_REPLACEMENT` vs validación zod). |
| III. i18n                   | 6 códigos de error nuevos + textos de UI en `packages/i18n` es/en (test de paridad).                                                                                                                                                                                                                                                        |
| IV. TDD                     | Tests primero por tarea (unit del agregado/policy/handlers sin DB; integración de adapter y migración; e2e HTTP).                                                                                                                                                                                                                           |
| V. SDD + memoria            | Spec → clarify → plan → tasks → analyze; constitución (tabla 35) y CLAUDE.md actualizados al final.                                                                                                                                                                                                                                         |
| VI. Una tabla = un dominio  | Tabla nueva `account-credit-limit` → dominio `src/domains/account-credit-limit/` con leaf data module; solo su adapter la consulta; `bank-account`, `transaction`, `credit-statement`, `import`, `user` la componen por puerto. Conteo de tablas 34 → 35.                                                                                   |
| VII. Idempotencia           | `make-primary`: (a) estado absoluto. `replace-primary`: (c) `Idempotency-Key`, `card.replacePrimary`. `PATCH /accounts/:id` con `extraCreditLimits`: estado absoluto (a). Ninguna mueve saldo/cupo usado/cuotas.                                                                                                                            |
| VIII. Identificadores       | Tabla nueva con `@default(uuid(7))`; `:cardId`, `replacement.cardId` como `rowId`.                                                                                                                                                                                                                                                          |

**Data gates:**

- [x] Toda entidad nueva declara formato de identificador: `AccountCreditLimit.id` UUID v7.
- [x] Todo endpoint de escritura nuevo declara su forma de idempotencia: `make-primary` (a), `replace-primary` (c).
- [x] Toda FK del cuerpo declara dónde se verifica su ownership: `replacement.cardId` en
      `ReplacePrimaryCardHandler` contra el agregado `BankAccount` cargado por (`userId`, `accountId`) con
      `FOR UPDATE`.

**Re-check post-diseño**: sin violaciones. Sin entradas en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/039-primary-card-swap/
├── spec.md
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
apps/api/
├── prisma/
│   ├── schema.prisma                                  # + AccountCreditLimit, relación en BankAccount
│   └── migrations/<ts>_account_credit_limits/migration.sql
├── prisma/seed.ts                                     # cupos USD de cuenta en vez de CardLimit de la principal
└── src/domains/
    ├── account-credit-limit/                          # NUEVO dominio-tabla
    │   ├── account-credit-limit.data.module.ts
    │   ├── domain/{account-credit-limit.entity.ts, ports/account-credit-limit.repository.port.ts,
    │   │           ports/currency-usage-lookup.port.ts}
    │   └── infrastructure/prisma-account-credit-limit.repository.ts
    ├── bank-account/
    │   ├── domain/{bank-account.aggregate.ts, errors.ts, ports/bank-account.repository.port.ts}
    │   ├── application/commands/{make-primary-card.*, replace-primary-card.*, update-card.handler.ts,
    │   │                         remove-card.handler.ts, add-card.handler.ts, create-account.handler.ts,
    │   │                         update-account.handler.ts}
    │   ├── application/queries/account-dto.mapper.ts
    │   ├── infrastructure/prisma-bank-account.repository.ts
    │   └── presentation/accounts.controller.ts
    ├── card-account/infrastructure/prisma-card-account.repository.ts   # removeWithTx/updateWithTx si faltan
    ├── transaction/
    │   ├── domain/{movement-policy.ts, errors.ts, ports/transaction.repository.port.ts,
    │   │           ports/transaction-sums.repository.port.ts}
    │   ├── application/{credit-pool-usage.ts (nuevo), card-limit-usage.ts,
    │   │                commands/create-transaction.handler.ts, commands/update-transaction.handler.ts}
    │   └── infrastructure/{prisma-transaction.repository.ts, prisma-transaction-sums.repository.ts}
    ├── installment-plan/  (existsForCard)
    ├── credit-statement/application/{foreign-settlement.ts, commands/pay-*.ts, prepay-*.ts, update-statement-payment.*}
    ├── import/{domain/template-plan.ts, application/template-context.loader.ts, application/commands/import-template.handler.ts}
    └── user/application/commands/update-preferences.handler.ts
apps/api/test/{unit,integration,e2e}/domains/{account-credit-limit,bank-account,transaction,credit-statement,import}/…

packages/contracts/src/accounts/index.ts               # extraCreditLimits, replacePrimaryCardSchema, needsPrimaryCard
packages/i18n/src/{es,en}.json                         # errors.* + accounts.primary.* + accounts.pools.*

apps/web/src/domains/accounts/
├── api/cardsApi.ts + hooks/useCards.ts                # makePrimary, replacePrimary
├── components/{ExtraCurrencyLimits.tsx, AccountForm.tsx, AccountCreateModal.tsx, CardForm.tsx,
│               CardFormPanel.tsx, CardDetailPanel.tsx, CardDetailSurface.tsx, CardsAside.tsx,
│               AccountVisualCard.tsx, ReplacePrimaryPanel.tsx (nuevo), PrimaryCardNotice.tsx (nuevo)}
└── routes/AccountDetailRoute.tsx
apps/web/src/domains/transactions/components/TransactionFormPanel.tsx   # monedas con cupo (R16)
apps/web/src/domains/import/lib/{templateData.ts, resolveTemplate.ts}
```

**Structure Decision**: monorepo existente; un dominio-tabla nuevo en `apps/api`, sin carpetas nuevas en
web fuera de `domains/accounts/components`.

## Fases de implementación (orden de dependencias)

1. **Contrato + i18n** — esquemas, helper `needsPrimaryCard`, códigos de error.
2. **Datos** — modelo Prisma, migración expand (tabla, datos, índice parcial), dominio
   `account-credit-limit` (puerto + adapter + leaf), carga en el agregado `BankAccount`.
3. **US1 cupos de cuenta** — `sumsForAccountCurrency`/`sumsByAccountCurrency`, `creditPoolUsage`,
   `MovementPolicy` (moneda sin cupo, cupo extranjero, nunca a pesos), DTO `creditPools`, crear/editar
   cuenta con `extraCreditLimits` (+ compat de `limits` de la principal), liquidación sin tarjeta, web
   `ExtraCurrencyLimits` en la cuenta.
4. **US2 sub-topes** — reglas del agregado en `normalizeLimits`, `CardForm` (monedas con cupo, máximo).
5. **US3/US4 cambio de principal** — `changePrimary` + invariante, `make-primary`, `replace-primary`
   (DEACTIVATE con existente o nueva), rechazo en PATCH; web `ReplacePrimaryPanel`, "Marcar como
   principal", aviso de cuenta sin principal.
6. **US5 eliminar** — `existsForCard` en transaction e installment-plan, `DELETE` vía `replace-primary`,
   rechazo en `DELETE` de la principal.
7. **Importación, semilla, puerto de monedas en uso.**
8. **Docs y memoria** — CLAUDE.md, constitución 2.9.0 (35 tablas), `docs/{english,spanish}/BANKING_LOGIC.md`,
   `docs/PENDING.md` (contracción pendiente).

## Complexity Tracking

Sin violaciones de la constitución.

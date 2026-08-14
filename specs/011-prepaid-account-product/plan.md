# Implementation Plan: Cuenta prepago como producto independiente

**Branch**: `011-prepaid-account-product` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-prepaid-account-product/spec.md`

## Summary

El prepago deja de ser una **tarjeta con pote propio colgada de una cuenta corriente/vista** y pasa a
ser un **tipo de cuenta**: `AccountType.PREPAID`, con número de cuenta, emisor, moneda y saldo propio,
que solo admite tarjetas `PREPAID` (una o varias) y cuyo saldo nunca baja de cero. La tarjeta prepago
pierde su balance propio (`prepaidBalance`/`prepaidInitialBalance` se eliminan de `card-account`),
junto con el endpoint de recarga y su panel: cargar la cuenta es un **traspaso** (spec 010) o un
ingreso normal. La regla nueva de dominio es una sola —_una cuenta prepago no puede quedar en
negativo_— aplicada en el mismo punto donde ya se validan los cupos (`MovementPolicy`) y en
`TransferPolicy` para la pata de salida.

Es una migración que **quita** más de lo que agrega: desaparece la excepción de
`accountBalanceDelta` (el gasto con prepago sí mueve el saldo de su cuenta, porque ahora el dinero
vive ahí), desaparecen `prepaidDelta`/`prepaidDeltas`/`incrementPrepaidBalanceWithTx` y el comando
`LoadPrepaidCard`.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20

**Primary Dependencies**: NestJS 11 + `@nestjs/cqrs` + Prisma 7 (`@prisma/adapter-pg`) en `apps/api`;
Vite + React 19 + TanStack Query + react-router v8 + Tailwind en `apps/web`; zod (`@finance/contracts`)
y `decimal.js` (`@finance/money`). **Ninguna dependencia nueva.**

**Storage**: PostgreSQL vía Prisma; sin carpeta `prisma/migrations` — el flujo es `pnpm db:push`
(+ `pnpm db:reset` para rehacer datos de ejemplo).

**Testing**: Vitest — `apps/api/test/{unit,integration,e2e}` espejando `src/`, tests de componente en
`apps/web`, y `packages/contracts` con su propia suite.

**Target Platform**: API Node 20 + SPA navegador.

**Project Type**: Monorepo web (API + SPA + packages compartidos).

**Performance Goals**: Sin objetivos nuevos; la validación de saldo es aritmética sobre una fila ya
leída, no agrega consultas (el saldo de la cuenta ya se lee para el delta).

**Constraints**: Dinero solo como string decimal / `Prisma.Decimal` (nunca float); toda consulta
scopeada por `userId`; errores como códigos agnósticos del idioma con paridad es/en; contratos zod
como única fuente de forma.

**Scale/Scope**: 3 paquetes tocados; ~2 columnas eliminadas, 1 valor de enum agregado, 1 endpoint
eliminado, ~10 archivos de API y ~10 de web.

## Constitution Check

_GATE: revisado antes de Phase 0 y de nuevo tras Phase 1._

| Principio                                  | Cumplimiento                                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Money Precision                         | Saldo y montos siguen siendo `moneyString`/`Decimal(18,4)`; la comparación "no negativo" usa `toMoney` de `@finance/money`. Sin floats.                                            |
| II. Per-User Data Isolation                | No hay consultas nuevas; las existentes ya filtran por `userId`. La validación de saldo usa la cuenta ya cargada por el handler.                                                   |
| III. i18n Parity                           | Claves nuevas (`accounts.type.PREPAID`, errores nuevos) en es.json **y** en.json; `src/i18n/parity.test.ts` lo verifica. Se eliminan las claves de recarga.                        |
| IV. Test-First / TDD                       | Cada regla nueva entra primero como test unitario de `MovementPolicy`/`TransferPolicy`/`BankAccount` y luego el código. Tasks ordenados así.                                       |
| V. SDD & Living Memory                     | Este ciclo termina actualizando constitución (regla de dominio nueva) y `CLAUDE.md` (modelo de datos, endpoint eliminado).                                                         |
| VI. DDD + CQRS, una tabla = un dominio     | Sin dominios nuevos: cambian `bank-account` (agregado, reglas de tarjeta), `card-account` (columnas eliminadas) y `transaction` (políticas). Cada tabla sigue con un solo adapter. |
| Arquitectura: contratos como fuente única  | `AccountType`, la matriz tipo-cuenta ↔ kind-tarjeta y los helpers viven en `@finance/contracts` y se consumen desde API y web.                                                     |
| Arquitectura: transfer no es ingreso/gasto | Sin cambios en `EXCLUDE_TRANSFERS`; la carga de una prepago ES un traspaso y por tanto ya queda fuera de los agregados de ingreso/gasto.                                           |
| No silent placeholders                     | Nada queda simulado. Se ELIMINA de `docs/PENDING.md` el punto 6 (borrar la recarga de una prepago no devuelve el saldo), que este cambio hace desaparecer.                         |

**Resultado: PASS**, sin violaciones que justificar (la tabla Complexity Tracking queda vacía y se
omite).

## Project Structure

### Documentation (this feature)

```text
specs/011-prepaid-account-product/
├── plan.md              # Este archivo
├── research.md          # Phase 0: decisiones y alternativas
├── data-model.md        # Phase 1: entidades, columnas, reglas
├── quickstart.md        # Phase 1: cómo validar la feature end-to-end
├── contracts/           # Phase 1: contrato público (tipos zod + endpoints)
│   └── accounts.md
├── checklists/
│   └── requirements.md  # generado por /speckit-specify
└── tasks.md             # Phase 2 (/speckit-tasks — NO lo crea /speckit-plan)
```

### Source Code (repository root)

```text
packages/contracts/src/accounts/index.ts        # AccountType += PREPAID; matriz kind↔tipo;
                                                # se eliminan prepaidBalance/prepaidInitialBalance y
                                                # loadPrepaidCardSchema

apps/api/prisma/
├── schema.prisma                               # enum AccountType += PREPAID; CardAccount pierde
│                                               # prepaidInitialBalance/prepaidBalance
└── seed.ts                                     # cuenta prepago propia + tarjeta + movimientos + carga

apps/api/src/domains/
├── bank-account/
│   ├── domain/bank-account.aggregate.ts        # assertCardable, assertCardKindAllowed,
│   │                                           # assertTypeChangeAllowed; se elimina prepaidPot
│   ├── domain/errors.ts                        # +CARD_KIND_NOT_ALLOWED, +ACCOUNT_TYPE_CHANGE_NOT_ALLOWED;
│   │                                           # −PREPAID_BALANCE_NOT_ALLOWED, −INVALID_PREPAID_BALANCE
│   ├── application/commands/                   # add-card / update-card / create-account / update-account;
│   │                                           # se ELIMINA load-prepaid-card.{command,handler}.ts
│   ├── application/queries/account-dto.mapper.ts
│   ├── presentation/accounts.controller.ts     # se elimina POST /accounts/:id/cards/:cardId/load
│   └── bank-account.module.ts
├── card-account/
│   ├── domain/card-account.entity.ts           # sin pote propio
│   ├── domain/ports/card-account.repository.port.ts  # −incrementPrepaidBalanceWithTx
│   └── infrastructure/prisma-card-account.repository.ts
└── transaction/
    ├── domain/movement-policy.ts               # saldo de cuenta PREPAID nunca negativo; −prepaidDelta
    ├── domain/transfer-policy.ts               # la pata de salida respeta el saldo prepago
    ├── domain/balance-delta.ts                 # −accountBalanceDelta (la excepción desaparece)
    ├── domain/ports/transaction.repository.port.ts   # −prepaidDeltas
    ├── infrastructure/prisma-transaction.repository.ts
    └── application/commands/{create,update,remove}-transaction.handler.ts

apps/api/test/{unit,integration,e2e}/…          # espejo de lo anterior

apps/web/src/
├── domains/accounts/components/
│   ├── AccountCreateModal.tsx / AccountForm.tsx  # tipo PREPAID seleccionable, sin cupo ni facturación
│   ├── CardForm.tsx / CardFormPanel.tsx          # se elimina la sección "saldo cargado"
│   ├── CardDetailPanel.tsx                       # sin saldo de tarjeta ni acción Recargar
│   ├── AccountVisualCard.tsx                     # la tarjeta prepago muestra el saldo de SU CUENTA
│   ├── CardsAside.tsx                            # permite tarjetas en cuentas PREPAID
│   └── LoadPrepaidPanel.tsx                      # ELIMINADO
├── domains/accounts/api/cardsApi.ts              # −load
├── domains/accounts/routes/AccountDetailRoute.tsx# sin secciones de cupo/facturación en prepago
└── i18n/{es,en}.json                             # claves nuevas y eliminadas, en paridad

docs/{english,spanish}/BANKING_LOGIC.md           # el prepago como producto propio
docs/PENDING.md                                   # se elimina el punto 6 (recarga)
```

**Structure Decision**: no se crean dominios ni paquetes nuevos. El cambio es una **corrección de
modelo** dentro de los tres dominios-tabla que ya poseen estas reglas (`bank-account` dueño del
agregado, `card-account` dueño de su tabla, `transaction` dueño de las políticas de movimiento), más
el contrato compartido y la UI que lo consume.

## Phase 0 — Research

Ver [research.md](./research.md). Resumen de decisiones:

1. **`PREPAID` como valor de `AccountType`** (no como una tabla ni un flag).
2. **Matriz tipo-de-cuenta ↔ kind-de-tarjeta en `@finance/contracts`**, sustituyendo a
   `CARDABLE_ACCOUNT_TYPES` como única regla.
3. **Eliminar el pote de la tarjeta** en vez de mantenerlo como sub-saldo.
4. **La regla "saldo nunca negativo" es del tipo de cuenta, no de la tarjeta**, y reutiliza el código
   de error `PREPAID_INSUFFICIENT_BALANCE`.
5. **Cargar = traspaso**: se elimina `POST /accounts/:id/cards/:cardId/load`.
6. **Cambio de tipo prohibido** hacia/desde `PREPAID` (FR-016).
7. **Sin migración de datos**: `db push` + seed rehecho.

## Phase 1 — Design & Contracts

- [data-model.md](./data-model.md) — entidades, columnas que entran/salen, invariantes y transiciones.
- [contracts/accounts.md](./contracts/accounts.md) — contrato público: esquemas zod afectados,
  endpoints eliminados y códigos de error nuevos.
- [quickstart.md](./quickstart.md) — cómo levantar y validar la feature end-to-end.

**Constitution Check (post-diseño): PASS.** El diseño no agrega dominios, dependencias, endpoints ni
tablas; elimina una excepción de dominio (el pote de la tarjeta) y concentra la regla nueva en las dos
políticas puras que ya existen, ambas cubiertas por tests unitarios sin base de datos.

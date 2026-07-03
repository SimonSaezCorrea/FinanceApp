# Data Model: Rediseño Cuentas y Movimientos con tarjetas secundarias

**Feature**: 007-accounts-movements-redesign · **Date**: 2026-07-02

Cambios sobre el esquema Prisma existente (`apps/api/prisma/schema.prisma`). Money en `Decimal(18,4)` en persistencia y decimal strings en contratos.

## BankAccount (modificado)

| Campo | Tipo | Nota |
| ----- | ---- | ---- |
| `accountNumber` | `String?` | **NUEVO**. Número de cuenta bancaria, texto libre, opcional, guardado/mostrado completo (no es PAN). |

Sin otros cambios. Reglas: opcional; sin unicidad.

## Card (modificado)

| Campo | Tipo | Nota |
| ----- | ---- | ---- |
| `parentCardId` | `String?` | **NUEVO**. Auto-relación → tarjeta principal de la misma cuenta. `null` = principal. |
| `parent` | `Card?` | relación `@relation("CardChildren", fields:[parentCardId], references:[id], onDelete: Cascade)`. |
| `children` | `Card[]` | inversa `@relation("CardChildren")`. |

Índice: `@@index([parentCardId])`.

**Reglas (servicio):**
- `parent` debe existir, ser del mismo `userId` y misma `accountId`.
- `parent.parentCardId` debe ser `null` (un solo nivel; no secundaria-de-secundaria).
- Pool de cupo compartido solo si ambas `kind = CREDIT`. Débito con `parentCardId` = etiqueta "secundaria" sin lógica de tope.
- Borrar la principal ⇒ cascade borra secundarias (y sus `CardLimit`).

## CardLimit (modificado)

| Campo | Tipo | Nota |
| ----- | ---- | ---- |
| `currency` | `String` | existente. `@@unique([cardId, currency])`. |
| `limit` | `Decimal(18,4)` | existente. Tope propio (para secundaria = sub-tope). |
| `initialUsed` | `Decimal(18,4) @default(0)` | **NUEVO**. Semilla de usado (deuda preexistente al alta). |
| ~~`used`~~ | — | **ELIMINADO como entrada mutable**. El usado se **deriva** (ver abajo). Backfill: `initialUsed = used` antes de eliminar la columna. |

**Usado reconciliado (derivado, calculado on-read y en enforcement):**
```
used(card, cur)      = initialUsed(card,cur) + Σ EXPENSE.amount        [tx.cardId = card.id, tx.currency = cur]
usedTotal(principal) = used(principal,cur) + Σ_child used(child,cur)    [agrega secundarias]
used(secundaria)     = used(secundaria,cur)                            [solo propio]
```

## Transaction (reglas reforzadas; esquema sin columnas nuevas)

- `bankAccountId`: se mantiene `String?` en DB (preserva histórico), pero **requerido para movimientos nuevos** vía contrato (`createTransactionSchema`).
- `cardId`: `String?`. Reglas (contrato + servicio):
  - `INCOME` ⇒ `cardId` nulo (contrato refine).
  - `EXPENSE` en cuenta `CASH` ⇒ `cardId` nulo (servicio).
  - `EXPENSE` en cuenta `≠ CASH` ⇒ `cardId` obligatorio, tarjeta ∈ cuenta (servicio).
- Efecto sobre saldos/cupos:
  - `currentBalance` de la cuenta: sin cambios de fórmula (reconcile existente).
  - `used` de tarjeta de crédito: derivado (no requiere columna); crear/editar/eliminar/mover el gasto recalcula automáticamente al leer.

## Contratos (`packages/contracts/src`)

**accounts/index.ts**
- `bankAccountSchema`: `+ accountNumber: z.string().nullable()`.
- `createBankAccountSchema` / `updateBankAccountSchema`: `+ accountNumber: z.string().trim().max(50).optional()`.
- `cardLimitSchema`: reemplazar `used` por `initialUsed: moneyString` (entrada) **y** `used: moneyString` (salida, derivado). Entrada de creación usa `initialUsed`; la respuesta incluye ambos.
- `cardSchema`: `+ parentCardId: z.string().nullable()`.
- `createCardSchema`: `+ parentCardId: z.string().optional()`; refine: si `parentCardId` presente ⇒ mismas validaciones de kind (débito permitido sin limits).

**transactions/index.ts**
- `createTransactionSchema`: `bankAccountId` pasa a **requerido** (`z.string()`); refine `INCOME ⇒ !cardId`.
- `transactionFiltersSchema`: ya soporta `bankAccountId` y `cardId` (filtro banco→tarjeta cubierto); añadir `includeInactive: z.coerce.boolean().optional()` si el listado de movimientos debe considerar cuentas inactivas en selectores (el filtrado de selectores es de frontend; el flag habilita traer inactivas en el fetch de cuentas del filtro).

## Endpoints afectados (contrato de API, prefix `/api/v1`)

- `POST /accounts`, `PATCH /accounts/:id` — aceptan `accountNumber`; cards inline aceptan `parentCardId` + `initialUsed`.
- `GET /accounts`, `GET /accounts/:id` — respuesta incluye `accountNumber`, `cards[].parentCardId`, `cards[].limits[].{initialUsed,used}` (used derivado agregado).
- `POST/PATCH /accounts/:id/cards[/:cardId]` — aceptan `parentCardId` + `initialUsed`; validan integridad de padre.
- `POST /transactions`, `PATCH /transactions/:id`, `DELETE /transactions/:id` — CRUD ya existe; se añade enforcement de cupo y reglas tarjeta/tipo. Nuevos códigos de error (ver research D6).
- `GET /transactions?bankAccountId=&cardId=&type=&from=&to=` — filtro banco→tarjeta ya soportado por query.

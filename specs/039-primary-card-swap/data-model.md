# Data Model: Cupos por moneda en la cuenta y cambio de tarjeta principal

## Tabla nueva: `account-credit-limit` (modelo `AccountCreditLimit`)

Dominio-tabla nuevo `apps/api/src/domains/account-credit-limit/` (`domain/` + `infrastructure/` +
`account-credit-limit.data.module.ts`). Entidad del agregado `BankAccount`: solo se escribe a través de él.

| Campo                     | Tipo                           | Reglas                                                                                         |
| ------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `id`                      | `String @id @default(uuid(7))` | UUID v7 (Principio VIII)                                                                       |
| `accountId`               | `String` → `BankAccount.id`    | `onDelete: Cascade`                                                                            |
| `currency`                | `String`                       | ISO 4217; DISTINTA a `BankAccount.currency`; en las monedas habilitadas del usuario al crearse |
| `limitAmount`             | `Decimal(18,4)`                | `> 0`; `≥` cada sub-tope (`CardLimit`) de las adicionales en esa moneda                        |
| `usedInitial`             | `Decimal(18,4) @default(0)`    | `≥ 0`; deuda previa al primer movimiento                                                       |
| `createdAt` / `updatedAt` | `DateTime`                     |                                                                                                |

- `@@unique([accountId, currency])`, `@@map("account-credit-limit")`.
- **Derivados (no se guardan)**: `used = usedInitial + Σ EXPENSE − Σ INCOME` de los movimientos de la
  cuenta en esa moneda que siguen adeudados (`STILL_OWED`) + `carriedOverAmount` adeudado en esa moneda;
  `available = limitAmount − used`.
- Quitarlo exige: `used = 0`, ninguna facturación de esa moneda sin liquidar, ningún sub-tope en esa
  moneda (`CREDIT_POOL_IN_USE`, 409).

## Cambios en tablas existentes

### `card-account` (`CardAccount`)

- Sin columnas nuevas.
- **Índice único parcial** (SQL a mano en la migración): `UNIQUE ("accountId") WHERE "isPrimary"`.
- Invariante (agregado `BankAccount`): si la cuenta tiene ≥ 1 tarjeta CREDIT, exactamente una tiene
  `isPrimary = true` y esa tiene `isActive = true`.

### `card-limit` (`CardLimit`)

- Sin columnas nuevas. Significado: **sub-tope de una adicional** en una moneda.
- Reglas nuevas: nunca en la principal; solo en monedas con cupo de la cuenta (la de la cuenta siempre
  tiene); `0 < limitAmount ≤ cupo de esa moneda`.
- Filas de principales en otra moneda: legado de antes de la migración; el código nuevo las ignora y se
  borran en una migración de contracción posterior.

### `bank-account` (`BankAccount`)

- Sin columnas nuevas. `creditLimit`/`creditUsedInitial`/`creditUsed` siguen siendo el cupo en la moneda
  de la cuenta.

## Agregado `BankAccount` (dominio)

- `props.creditPools: AccountCreditLimitProps[]` (nuevo, cargado con la cuenta).
- `changePrimary(newPrimaryId)`: la nueva queda principal sin `limits`; la anterior adicional sin `limits`.
  Errores: `PRIMARY_CARD_INVALID_REPLACEMENT` (no CREDIT, inactiva, otra cuenta, la misma).
- `assertPrimaryInvariant()`: lo llaman update-card, remove-card y replace-primary antes de persistir →
  `PRIMARY_CARD_REPLACEMENT_REQUIRED`.
- `setExtraCreditLimits(list)`: reemplaza el conjunto de cupos extranjeros; valida moneda ≠ la de la
  cuenta, `> 0`, `≥ sub-topes`; quitar uno en uso lo decide el handler con los usos cargados.
- `normalizeLimits` (sub-topes): rechaza moneda sin cupo y monto sobre el cupo de esa moneda.

## Estados de una tarjeta CREDIT (rol × actividad)

```text
                 make-primary / replace-primary (destino)
  ADICIONAL ─────────────────────────────────────────────► PRINCIPAL (activa)
  (activa/inactiva)                                            │
       ▲                                                       │ replace-primary DEACTIVATE (origen)
       │ make-primary / replace-primary (otra pasa a principal)│
       └───────────────────────────────────────────────────────┘
  PRINCIPAL ──replace-primary DELETE (sin historia)──► eliminada
  PRINCIPAL ──PATCH isActive=false / DELETE──► rechazado (PRIMARY_CARD_REPLACEMENT_REQUIRED)
  ADICIONAL inactiva ──reactivar──► ADICIONAL activa (nunca vuelve sola a principal)
```

## Migración `account_credit_limits` (expand)

1. Crear `account-credit-limit`.
2. Por cuenta y moneda extranjera con filas en `card-limit` de sus tarjetas CREDIT:
   `limitAmount = límite de la principal (o 0) + Σ límites de adicionales`, `usedInitial = Σ usedInitial`.
3. Índice único parcial de principal en `card-account`.
4. No borra `card-limit` de principales (contracción posterior).

# Phase 1 — Data Model: Cuenta prepago como producto independiente

## Cambios de esquema (`apps/api/prisma/schema.prisma`)

### `enum AccountType`

```diff
 enum AccountType {
   CHECKING     // Corriente
   SIGHT        // Vista / Cuenta RUT
   SAVINGS      // Ahorro
   INVESTMENT   // Inversiones
   CREDIT_LINE  // Línea de crédito (tarjeta de crédito sin cuenta bancaria)
+  PREPAID      // Cuenta prepago (fondos provisionados; emisor bancario o no bancario)
   CASH         // Efectivo
 }
```

### `model CardAccount`

```diff
-  /// PREPAID cards only: the card's OWN pot of money…
-  prepaidInitialBalance Decimal? @db.Decimal(18, 4)
-  prepaidBalance        Decimal? @db.Decimal(18, 4)
```

Sin columnas nuevas. `BankAccount` no cambia: `initialBalance`/`currentBalance` ya son lo que la
cuenta prepago necesita, y `creditLimit`/`creditUsed*` simplemente se quedan en 0.

## Entidades (vista de dominio)

### `BankAccount` (agregado raíz) — tipo `PREPAID`

| Campo                           | Valor en una cuenta prepago                              |
| ------------------------------- | -------------------------------------------------------- |
| `type`                          | `PREPAID`                                                |
| `accountNumber`                 | **obligatorio** (la cuenta recibe transferencias por él) |
| `institutionId` / `institution` | opcional, catálogo completo sin filtrar por `kind` (D7)  |
| `initialBalance`                | saldo con el que se registra; **no puede ser negativo**  |
| `currentBalance`                | `initialBalance + Σingresos − Σgastos`; **nunca < 0**    |
| `creditLimit`/`creditUsed*`     | siempre `0`; no configurables                            |
| `billingSettings`               | ninguno; no se crea fila                                 |
| `cards`                         | 0..n, todas de kind `PREPAID`                            |

**Invariantes nuevas**

- **INV-1 (saldo no negativo)**: ninguna operación puede dejar `currentBalance < 0`. Se valida al
  crear/editar un gasto, y en la pata de salida de un traspaso.
- **INV-2 (kind de tarjeta)**: solo se aceptan tarjetas `PREPAID`; recíprocamente, ninguna otra cuenta
  acepta una tarjeta `PREPAID` (matriz D2).
- **INV-3 (sin crédito)**: `creditLimit`, `creditUsedInitial`, `billingCycleDay`, `paymentMethod` y
  `minimumPaymentPercent` se **rechazan** (refinamiento zod en `createBankAccountSchema`) en una
  cuenta `PREPAID`; no se ignoran silenciosamente.
- **INV-4 (tipo inmutable)**: no se puede cambiar el `type` de una cuenta hacia o desde `PREPAID`.
- **INV-5 (saldo inicial)**: `initialBalance` negativo se rechaza al crear.

### `CardAccount` — kind `PREPAID`

| Campo                                      | Después del cambio                          |
| ------------------------------------------ | ------------------------------------------- |
| `prepaidBalance` / `prepaidInitialBalance` | **eliminados**                              |
| `isPrimary`                                | irrelevante (solo aplica a CREDIT), `false` |
| `limits` (`CardLimit`)                     | siempre vacío                               |
| `ownUsed`                                  | `"0"` (solo tiene sentido en CREDIT)        |

Lo que la tarjeta muestra como saldo es el `currentBalance` de su cuenta, derivado en la UI, no un
campo propio.

### `Transaction`

Sin cambios de esquema. Cambia su interpretación:

- Un `EXPENSE` con tarjeta `PREPAID` **sí** mueve el `currentBalance` de su cuenta (antes no lo movía:
  el dinero ya había salido al recargar). Desaparece la excepción `accountBalanceDelta`.
- Un `EXPENSE` en una cuenta `PREPAID` **sin** tarjeta también descuenta el saldo y también está
  acotado por él.
- Contribución al pozo de crédito: siempre `"0"` en una cuenta `PREPAID`.
- `creditStatementId`: siempre `null` (una cuenta prepago no abre períodos de facturación).

### Traspaso (par de `Transaction` con `transferGroupId`)

- Destino `PREPAID`: **permitido** (es la forma de cargar la cuenta). La prohibición existente solo
  aplica a `CREDIT_LINE`.
- Origen `PREPAID`: permitido, sujeto a INV-1.

## Transiciones de estado

| Operación                                   | Efecto sobre `currentBalance` de la prepago | Rechazo                                                              |
| ------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| Crear cuenta                                | `= initialBalance`                          | `INVALID_INITIAL_BALANCE` si < 0                                     |
| INCOME en la cuenta                         | `+ amount`                                  | —                                                                    |
| EXPENSE (con o sin tarjeta prepago)         | `− amount`                                  | `PREPAID_INSUFFICIENT_BALANCE`                                       |
| Editar EXPENSE                              | revierte el anterior y aplica el nuevo      | `PREPAID_INSUFFICIENT_BALANCE` (evaluado sin su propio monto previo) |
| Borrar EXPENSE                              | `+ amount` (revierte)                       | —                                                                    |
| Traspaso entrante                           | `+ amountIn`                                | —                                                                    |
| Traspaso saliente                           | `− amountOut`                               | `PREPAID_INSUFFICIENT_BALANCE`                                       |
| Cambiar tipo de cuenta a/desde PREPAID      | —                                           | `ACCOUNT_TYPE_CHANGE_NOT_ALLOWED`                                    |
| Agregar tarjeta no-PREPAID a cuenta PREPAID | —                                           | `CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT`                                  |
| Agregar tarjeta PREPAID a cuenta no-PREPAID | —                                           | `CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT`                                  |

## Datos de ejemplo (seed)

- Se elimina la tarjeta "Prepago · Rosa" de la cuenta corriente.
- Se crea la cuenta **"Tenpo Prepago"** (`type: PREPAID`, emisor no bancario, CLP, número de cuenta,
  saldo inicial) con **dos** tarjetas prepago que comparten su saldo, algunos gastos, y **una carga
  como traspaso** desde la cuenta corriente.
- La cuenta prepago queda fijada en la cartera del panel, reemplazando el pin de la tarjeta anterior.

# Data Model: Plantilla oficial de importación en bloque (027)

**Sin tablas nuevas ni columnas nuevas.** La feature crea registros de tablas existentes con sus
reglas existentes. Los cambios de persistencia son de comportamiento (una consulta con un filtro
más) y de puertos (`*WithTx` que faltaban).

## Cambios en puertos y adapters existentes

| Dominio               | Cambio                                                                                                                                          | Por qué                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `installment-payment` | `listUnbilledDueForPlans` filtra además `paidAt: null`                                                                                          | Una cuota pagada fuera de la app nunca se factura (research R7, FR-018).                                                      |
| `debt`                | `DebtRepositoryPort.createWithTx(tx, userId, plan)`                                                                                             | Crear dentro de la transacción del import (R4).                                                                               |
| `recurring-expense`   | `RecurringExpenseRepositoryPort.createWithTx(tx, userId, plan)`                                                                                 | Ídem.                                                                                                                         |
| `savings-goal`        | `SavingsGoalRepositoryPort.createWithTx(tx, userId, plan)`                                                                                      | Ídem.                                                                                                                         |
| `bank-account`        | `BankAccountRepositoryPort.adjustOpeningWithTx(tx, accountId, balanceDelta, creditDelta)` — incrementa `initialBalance` y `creditUsedInitial`   | Modo "mi saldo ya incluye" (R8, FR-022a).                                                                                     |
| `transaction`         | `TransactionWriterRepositoryPort.createManyWithTx` acepta `id` opcional por fila                                                                | Enlazar pagos/aportes a su movimiento sin una lectura extra (R4).                                                             |
| `credit-statement`    | `CreditStatementRepositoryPort.findOrCreateOpenForAccountWithTx(tx, accountId, fallbackPeriodStart)`                                            | El período abierto se resuelve dentro del commit: preview nunca escribe y un commit fallido no deja un período huérfano (R9). |
| `installment-plan`    | `InstallmentPlanRepositoryPort` gana una escritura en bloque del estado de pago de varias cuotas (o se reutiliza `savePaymentWithTx` por cuota) | Marcar pagadas las cuotas importadas.                                                                                         |

Todos los ids nuevos son UUID v7 (`@default(uuid(7))` o `generateRowId()`), Principio VIII.

## Entidades del request (contrato, no persistidas)

Todas en `packages/contracts/src/import/template.ts`. Cada fila lleva `row: number` (fila de Excel,
1-based, la del encabezado es 1) para que un error vuelva a su celda. Montos `moneyString`, ids
`rowId`, fechas ISO `z.string().datetime()`.

### TemplateImportRequest

| Campo                     | Tipo                                              | Regla                                                                          |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `balanceModes`            | `{accountId: rowId, mode: "INCLUDED" \| "ADD"}[]` | Una entrada por cuenta afectada; una cuenta afectada sin entrada = `INCLUDED`. |
| `movements`               | `TemplateMovement[]`                              |                                                                                |
| `transfers`               | `TemplateTransfer[]`                              |                                                                                |
| `debts` / `debtPayments`  | `TemplateDebt[]` / `TemplateDebtPayment[]`        |                                                                                |
| `plans` / `planPayments`  | `TemplatePlan[]` / `TemplatePlanPayment[]`        |                                                                                |
| `recurring`               | `TemplateRecurring[]`                             |                                                                                |
| `goals` / `contributions` | `TemplateGoal[]` / `TemplateContribution[]`       |                                                                                |

Refine: suma de todas las filas ≤ `TEMPLATE_IMPORT_MAX_ROWS` (5.000) y ≥ 1.

### Filas

- **TemplateMovement**: `row, occurredAt, type (INCOME|EXPENSE), amount, bankAccountId, cardId?,
categoryId?, description?, observation?, emisor?, receptor?, lugar?, financeCharge` — mismo
  contenido que `importRowSchema` + la cuenta por fila.
- **TemplateTransfer**: `row, occurredAt, fromAccountId, toAccountId, outgoingAmount,
incomingAmount, description?` — reglas de `TransferPolicy` (cuentas distintas, destino nunca
  tarjeta de crédito).
- **TemplateDebt**: `row, ref, direction, counterparty, title?, principal, currency, openedAt, dueAt?,
totalInstallments, frequency, frequencyInterval, paymentAccountId?, notes?`.
- **TemplateDebtPayment**: `row, debtRef, paidAt, accountId, amount?` — `amount`, si viene, debe ser
  igual a la cuota de la deuda (FR-009).
- **TemplatePlan**: `row, ref, title, startDate, totalPrincipal, installmentCount, currency,
frequency, frequencyInterval, aprPerPeriod?, cardId?, categoryId?, paymentAccountId?`.
- **TemplatePlanPayment**: `row, planRef, sequence, paidAt, accountId?, amount?` — `accountId` y
  `amount` obligatorios si el plan NO es de tarjeta de crédito, prohibidos si lo es.
- **TemplateRecurring**: `row, name, amount, currency, frequency, interval, anchorDate,
bankAccountId?, cardId?, categoryId?`.
- **TemplateGoal**: `row, ref, name, targetAmount, currency, deadline, notes?`.
- **TemplateContribution**: `row, goalRef, occurredAt, amount, bankAccountId`.

## Validaciones (servidor, con código y ubicación)

Cada error: `{ code, sheet, row, field? }` — `sheet` ∈ claves estables (`movements`, `transfers`,
`debts`, `debtPayments`, `plans`, `planPayments`, `recurring`, `goals`, `contributions`).

| Regla                                                                               | Código                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cuenta/tarjeta/categoría no es del usuario o no existe                              | `ACCOUNT_NOT_FOUND` / `CARD_NOT_FOUND` / `CATEGORY_NOT_FOUND`                                                                                                                                                                                                                                         |
| Cuenta inactiva                                                                     | `IMPORT_ACCOUNT_INACTIVE` (nuevo)                                                                                                                                                                                                                                                                     |
| Tarjeta no pertenece a la cuenta de la fila                                         | `CARD_ACCOUNT_MISMATCH`                                                                                                                                                                                                                                                                               |
| Moneda de la fila ≠ moneda de la cuenta (toda hoja, incluidos pagos de deuda — R13) | `IMPORT_CURRENCY_MISMATCH` (nuevo)                                                                                                                                                                                                                                                                    |
| Referencia duplicada en su hoja / pago o aporte con referencia huérfana             | `IMPORT_DUPLICATE_REF` / `IMPORT_UNKNOWN_REF` (nuevos)                                                                                                                                                                                                                                                |
| Más pagos que cuotas / cuota inexistente o repetida                                 | `IMPORT_TOO_MANY_PAYMENTS` / `IMPORT_INVALID_SEQUENCE` (nuevos)                                                                                                                                                                                                                                       |
| Pago/aporte anterior a su deuda, plan o meta                                        | `IMPORT_PAYMENT_BEFORE_START` (nuevo)                                                                                                                                                                                                                                                                 |
| Monto de pago de deuda ≠ monto de ESA cuota (la última = lo pendiente)              | `IMPORT_PAYMENT_AMOUNT_MISMATCH` (nuevo)                                                                                                                                                                                                                                                              |
| Pago de cuota de crédito con cuenta/monto, o sin crédito sin ellos                  | `IMPORT_PLAN_PAYMENT_FIELDS` (nuevo)                                                                                                                                                                                                                                                                  |
| Toda regla de `MovementPolicy`/`TransferPolicy`/agregados                           | su código existente (`PREPAID_INSUFFICIENT_BALANCE`, `OVERDRAFT_LIMIT_EXCEEDED`, `BALANCE_CEILING_EXCEEDED`, `CARD_LIMIT_EXCEEDED`, `CARD_SUBLIMIT_EXCEEDED`, `CATEGORY_NOT_ALLOWED`, `TRANSFER_TO_CREDIT_ACCOUNT`, `DEBT_PAYMENT_FROM_CREDIT_ACCOUNT`, `INSTALLMENT_PAYMENT_FROM_CREDIT_ACCOUNT`, …) |

Validación de forma (celda vacía obligatoria, fecha/monto ilegible, nombre desconocido) ocurre en el
navegador antes de enviar, con los mismos `sheet`/`row`.

## Efectos por registro (dentro de la transacción)

| Registro                  | Crea                                                                                            | Dinero                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Movimiento                | `Transaction`                                                                                   | `cashDelta` o `creditUsed` según `isChargedToCredit`; enlazado al período abierto si toca cupo |
| Traspaso                  | 2 `Transaction` con `transferGroupId`                                                           | saldo de ambas cuentas                                                                         |
| Deuda                     | `Debt`                                                                                          | ninguno (FR-016a)                                                                              |
| Pago de deuda             | `Transaction` (INCOME si me deben, EXPENSE si debo, `debtId`) + `Debt.registerPayment`/`settle` | saldo de la cuenta                                                                             |
| Plan sin crédito          | `InstallmentPlan` + calendario                                                                  | ninguno                                                                                        |
| Pago de cuota sin crédito | `Transaction` EXPENSE (`installmentPlanId`) + `payInstallment` con arrastre                     | saldo                                                                                          |
| Plan con crédito          | `InstallmentPlan` + calendario + compra (+ interés como `financeCharge`)                        | `creditUsed` + (igual que `create-installment-plan.handler.ts`; sin validar cupo, R12)         |
| Pago de cuota con crédito | cuota `paidAt`/`paidAmount`, sin movimiento                                                     | `creditUsed` − monto (R7)                                                                      |
| Recurrente                | `RecurringExpense` activo                                                                       | ninguno                                                                                        |
| Meta                      | `SavingsGoal` abierta                                                                           | ninguno                                                                                        |
| Aporte                    | `SavingsEntry` + `Transaction` EXPENSE (`savingsEntryId`)                                       | saldo                                                                                          |

Con modo `INCLUDED`, el neto de caja y de crédito de la cuenta va a `adjustOpeningWithTx` en vez de a
los incrementos (R8).

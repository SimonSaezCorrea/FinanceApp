# Phase 1 — Contract: `@finance/contracts` › `installments`

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md)

Delta sobre `packages/contracts/src/installments/index.ts`. Todo importe es `moneyString` (string
decimal), toda fecha es ISO string. **Cambio incompatible**: `installmentPaymentSchema` gana campos
requeridos; el frontend es el único consumidor y se actualiza en el mismo commit.

---

## Esquemas modificados

### `installmentPaymentSchema`

```ts
{
  id: string,
  sequence: number,          // int positivo
  dueDate: string,
  amount: moneyString,       // monto PROGRAMADO — no cambia nunca tras crear el plan
  paidAt: string | null,     // fecha REAL de pago (no la de registro)

  // NUEVOS
  paidAmount: moneyString | null,   // lo realmente pagado; null = pagada antes de esta feature
  carriedOverAmount: moneyString,   // heredado de la cuota anterior; negativo si se pagó de más
  dueAmount: moneyString,           // DERIVADO: amount + carriedOverAmount
  transactionId: string | null,     // el gasto que la respalda; null si no lo hay o se borró
}
```

### `installmentPlanSchema`

```ts
{
  …campos actuales,

  // NUEVOS
  category: string | null,           // texto libre, mismo repertorio que los movimientos
  paymentAccountId: string | null,   // cuenta recordada; null en planes con tarjeta CREDIT

  // NUEVOS DERIVADOS (calculados por el API, nunca almacenados)
  paidTotal: moneyString,            // Σ (paidAmount ?? amount) de las cuotas pagadas
  remainingAmount: moneyString,      // lo que falta por pagar
  nextDueDate: string | null,        // vencimiento de la cuota impaga más antigua
  status: installmentPlanStatus,     // ver abajo
  generatesMovementOnPay: boolean,   // false ⇔ la tarjeta del plan es CREDIT (FR-035)
}
```

### `createInstallmentPlanSchema` / `updateInstallmentPlanSchema`

`create` gana `category?`, `paymentAccountId?`. `aprPerPeriod` **se mantiene** (ahora expuesto en el
formulario, FR-044) y su cargo financiero automático sigue vigente (FR-045).
`update` gana `category?`, `paymentAccountId?` (ambos nullable). Sigue **sin** aceptar
`totalPrincipal`, `installmentCount` ni `startDate` (INV-P4).

Refine nuevo en ambos: `paymentAccountId` presente + tarjeta CREDIT ⇒ `INSTALLMENT_CARD_IS_CREDIT`.
La validación de la tarjeta necesita el `kind`, que el contrato no conoce, así que el refine sólo
puede correr donde el `kind` se resuelve: **el agregado**. El contrato aporta el predicado
compartido, no la comprobación.

---

## Esquemas nuevos

### `installmentPlanStatus`

```ts
z.enum(["OVERDUE", "DUE_SOON", "ON_TRACK", "PARTIALLY_PAID", "PAID"])
```

`OVERDUE`: la cuota impaga más antigua vence antes de hoy. `DUE_SOON`: dentro de 7 días.
`ON_TRACK`: más adelante. `PARTIALLY_PAID`: no quedan cuotas impagas pero la última quedó cubierta
sólo en parte (FR-023) — **cuenta como plan activo**. `PAID`: no queda nada por pagar. (FR-003.)

### `payInstallmentSchema` — cuerpo de `POST …/payments/:sequence/pay`

```ts
{
  /** Omitido en un plan con tarjeta CREDIT: ahí sólo se marca (FR-035). */
  fromAccountId: string | null,
  /** Lo abonado A LA CUOTA, en la moneda del PLAN. Omitido = lo adeudado por la cuota. */
  amount: moneyString | null,
  /** Lo cargado A LA CUENTA, en su moneda. Requerido sólo cuando las monedas
   *  difieren (FR-029/FR-031); si coinciden, es `amount`. */
  chargedAmount: moneyString | null,
  /** Fecha real del pago. Omitida = hoy. */
  paidAt: string | null,
}
```

**Por qué dos montos y no uno**: sin tipo de cambio, "cuánto abona a la deuda" y "cuánto salió de la
cuenta" son dos hechos distintos que sólo el usuario conoce (FR-031). Cuando las monedas coinciden
—el caso normal— el segundo se deriva del primero y el formulario muestra un solo campo.

### Predicados compartidos (mismo criterio en UI y API)

```ts
/** false ⇔ la tarjeta del plan es CREDIT: la deuda ya está en su facturación (FR-035). */
export function generatesMovementOnPay(cardKind: CardKind | null): boolean;

/** Estado del plan a partir de su próxima cuota impaga (FR-003). */
export function planStatus(nextDueDate: string | null, now: Date): InstallmentPlanStatus;

/** Lo adeudado por una cuota: programado + arrastre (FR-022). */
export function dueAmountOf(payment: InstallmentPayment): string;
```

---

## Endpoints

| Método | Ruta | Cambio |
| --- | --- | --- |
| `GET` | `/installments` | Respuesta con los campos derivados nuevos. **Sin paginación** (R8) |
| `GET` | `/installments/:id` | Igual |
| `POST` | `/installments` | Acepta `category`, `paymentAccountId` |
| `PATCH` | `/installments/:id` | Acepta `category`, `paymentAccountId` |
| `DELETE` | `/installments/:id` | Sin cambios |
| `POST` | `/installments/:id/payments/:sequence/pay` | **Cuerpo nuevo** (`payInstallmentSchema`). Antes no tenía |
| `POST` | `/installments/:id/payments/:sequence/unpay` | Sin cuerpo. Ahora además borra el gasto, restituye el saldo y revierte el arrastre |

Rutas y verbos actuales se conservan: es la forma del cuerpo la que cambia, no la superficie.

---

## Códigos de error

Language-agnostic, con su clave `errors.<CODE>` en **es y en** (Principio III).

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `INSTALLMENT_PAYMENT_ALREADY_PAID` | 409 | Pagar una cuota que ya tiene `paidAt` (INV-C3; es lo que bloquea el doble clic) |
| `INSTALLMENT_PAYMENT_ACCOUNT_REQUIRED` | 400 | Falta `fromAccountId` en un plan que sí genera movimiento (FR-034) |
| `INSTALLMENT_CARD_IS_CREDIT` | 409 | Llega cuenta de pago en un plan con tarjeta CREDIT (INV-P2/FR-037) |
| `INVALID_PAYMENT_AMOUNT` | 400 | Monto cero o negativo (INV-C2) |
| `PAYMENT_CURRENCY_AMBIGUOUS` | 400 | Monedas distintas y falta `chargedAmount` (FR-029) |
| `PAYMENT_EXCEEDS_REMAINING` | 409 | El pago supera lo que el plan entero adeuda (FR-021b). **Código ya existente** en el dominio de facturación, reutilizado con el mismo significado |
| `INSTALLMENT_PAYMENT_FROM_CREDIT_ACCOUNT` | 409 | La cuenta de origen es una cuenta de tarjeta de crédito (FR-028b) |
| `TRANSACTION_LINKED_TO_INSTALLMENT` | 409 | Se intenta editar o eliminar, desde el dominio `transaction`, un movimiento que respalda una cuota (FR-028a) |

`TRANSACTION_LINKED_TO_INSTALLMENT` es el único código de esta feature que se lanza **fuera** del
dominio `installment-plan`: lo emiten los comandos de actualizar y eliminar movimiento, que deben
consultar si el movimiento está vinculado a una cuota antes de tocarlo.

**Reutilizados sin cambio**: `INSTALLMENT_PLAN_NOT_FOUND`, `INSTALLMENT_PAYMENT_NOT_FOUND`,
`ACCOUNT_NOT_FOUND` (cuenta ajena o inexistente), `PREPAID_INSUFFICIENT_BALANCE`,
`OVERDRAFT_LIMIT_EXCEEDED` (FR-026, vía `MovementPolicy` — R6).

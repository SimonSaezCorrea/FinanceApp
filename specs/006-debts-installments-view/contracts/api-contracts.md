# API Contracts: Cuotas y Deudas Redesign

## Debts API — cambios

### `GET /api/v1/debts` — sin cambios de ruta; respuesta extendida

```json
// Debt (response schema, campos nuevos marcados con *)
{
  "id": "string",
  "direction": "OWED_TO_YOU | YOU_OWE",
  "counterparty": "string",
  "principal": "decimal-string",
  "currency": "CLP",
  "openedAt": "ISO-datetime",
  "dueAt": "ISO-datetime | null",
  "interestApr": "decimal-string | null",
  "notes": "string | null",
  "settledAt": "ISO-datetime | null",
  "totalInstallments": 6, // * nuevo, default 1
  "paidInstallments": 2, // * nuevo, default 0
  "installmentAmount": "45000.0000 | null", // * nuevo, nullable
  "createdAt": "ISO-datetime",
  "updatedAt": "ISO-datetime"
}
```

### `POST /api/v1/debts` — body extendido

```json
// CreateDebt (request)
{
  "direction": "YOU_OWE",
  "counterparty": "Juan Pérez",
  "principal": "270000.0000",
  "currency": "CLP",
  "openedAt": "2026-07-01T00:00:00.000Z",
  "dueAt": null,
  "totalInstallments": 6, // opcional, default 1
  "installmentAmount": "45000.0000", // opcional, null si no se especifica
  "notes": "Deuda de viaje"
}
```

### `POST /api/v1/debts/:id/register-payment` — NUEVO

```json
// Request: body vacío {}

// Response: Debt actualizado
{
  "id": "...",
  "paidInstallments": 3, // incrementado
  "settledAt": null // o ISO-datetime si es el último pago
  // ... resto de campos
}

// Errores:
// 404 { "error": { "code": "DEBT_NOT_FOUND" } }
// 409 { "error": { "code": "DEBT_ALREADY_SETTLED" } }

// 409 { "error": { "code": "ALL_INSTALLMENTS_PAID" } }
```

### `POST /api/v1/debts/:id/settle` — sin cambios

Sigue existiendo para deudas de 1 cuota (pago único).

---

## Installments API — sin cambios

Todos los endpoints existentes son suficientes:

- `GET /api/v1/installments` — lista de planes con pagos
- `POST /api/v1/installments` — crear plan
- `POST /api/v1/installments/:planId/pay/:sequence` — marcar cuota pagada (no usado en este scope desde UI, pero disponible)
- `DELETE /api/v1/installments/:id` — eliminar plan

---

## Frontend UI Contract

### Vista Deudas (`/debts`)

```
PageHeader: "Deudas" + botón "Nueva deuda"
DebtKpiStrip: { debts: Debt[] } → calcula KPIs en frontend por moneda
DebtList: dos columnas OWED_TO_YOU / YOU_OWE
  DebtCard × N:
    avatar (inicial), counterparty, principal+currency, dueAt?
    if totalInstallments > 1: barra progreso + "N/M pagadas · $X restante"
    if totalInstallments=1 && !settledAt: botón "Marcar pagada"
    if totalInstallments>1 && paidInstallments<totalInstallments: botón "Registrar pago"
DebtCreateModal: { open, onOpenChange }
```

### Vista Cuotas (`/installments`)

```
PageHeader: "Cuotas" + botón "Nuevo plan"
InstallmentPlanList:
  InstallmentPlanCard × N (selectedId state):
    título, installmentCount, totalPrincipal, progreso, cuota mensual, chip próximo vencimiento
    onClick → setSelectedId(plan.id)
  PaymentCalendar (si selectedId): { plan: InstallmentPlan }
    tabla: #, Fecha, Monto, Estado (Pagada/Próxima/Pendiente)
InstallmentCreateModal: { open, onOpenChange }
```

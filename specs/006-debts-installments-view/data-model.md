# Data Model: Cuotas y Deudas Redesign

## Cambios de modelo

### `Debt` — 3 campos nuevos (extensión)

```prisma
model Debt {
  // ... campos existentes sin cambios ...
  id           String        @id @default(cuid())
  userId       String
  direction    DebtDirection
  counterparty String
  principal    Decimal       @db.Decimal(18, 4)
  currency     String        @default("USD")
  openedAt     DateTime
  dueAt        DateTime?
  interestApr  Decimal?      @db.Decimal(8, 4)
  notes        String?
  settledAt    DateTime?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  // NUEVOS
  totalInstallments  Int      @default(1)   // ≥ 1; 1 = pago único
  paidInstallments   Int      @default(0)   // 0 ≤ paidInstallments ≤ totalInstallments
  installmentAmount  Decimal? @db.Decimal(18, 4)  // null → principal / totalInstallments

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**Invariante**: `paidInstallments` nunca supera `totalInstallments`. El backend valida y rechaza `registerPayment` si ya están pagadas todas.

**Auto-settle**: cuando `registerPayment` lleva `paidInstallments` al valor de `totalInstallments`, el servicio setea `settledAt = now()` en la misma operación.

### `InstallmentPlan` / `InstallmentPayment` — sin cambios

El modelo existente es suficiente. Solo se rediseña la UI.

---

## Contratos de API (cambios)

### `@finance/contracts` → `debts/index.ts`

```typescript
// debtSchema — añadir campos
totalInstallments: z.number().int().min(1),
paidInstallments: z.number().int().min(0),
installmentAmount: moneyString.nullable(),

// createDebtSchema — añadir campos opcionales
totalInstallments: z.number().int().min(1).default(1),
installmentAmount: moneyString.optional(),

// updateDebtSchema = createDebtSchema.partial() — hereda automáticamente
```

### Nuevo endpoint: `POST /debts/:id/register-payment`

- **Request**: body vacío (la acción es atómica; no requiere parámetros)
- **Response**: `Debt` actualizado (mismo schema)
- **Errores**: `404 DEBT_NOT_FOUND`, `409 DEBT_ALREADY_SETTLED` (si `settledAt ≠ null`), `409 ALL_INSTALLMENTS_PAID` (si `paidInstallments = totalInstallments`)

---

## Tipos de frontend (nuevos)

### `DebtKpi` (lib/debtMetrics.ts)

```typescript
interface DebtKpi {
  currency: string;
  totalOwedToYou: string; // decimal string
  totalYouOwe: string; // decimal string
  netBalance: string; // totalOwedToYou - totalYouOwe
}
```

### `DebtRemainingAmount`

Calculado en frontend:

```
remaining = (totalInstallments - paidInstallments) × (installmentAmount ?? principal / totalInstallments)
```

Todo con `Decimal`. Resultado formateado con `formatMoney`.

---

## Transiciones de estado (Debt)

```
[activa, totalInstallments=1]
  → "Marcar pagada" → [settledAt = now()]

[activa, totalInstallments>1, paidInstallments < totalInstallments]
  → "Registrar pago" → [paidInstallments += 1]
    → si paidInstallments = totalInstallments: [settledAt = now()]

[settledAt ≠ null] → sin acciones disponibles
```

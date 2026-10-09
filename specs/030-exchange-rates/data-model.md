# Data Model — 030

## Nueva tabla: `exchange-rate` (dominio `exchange-rate`)

```prisma
model ExchangeRate {
  id        String   @id @default(uuid(7))
  /// "USD" (dólar observado) or "CLF" (UF). Value = pesos per ONE unit.
  currency  String   @db.VarChar(3)
  /// The calendar day this row answers for, in Chile (America/Santiago).
  date      DateTime @db.Date
  /// CLP per one `currency`, as published.
  value     Decimal  @db.Decimal(18, 4)
  /// The day the source actually published `value`. `valueDate < date` ⇒ the row is a
  /// "dato arrastrado" (derived, never stored as a flag).
  valueDate DateTime @db.Date
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([currency, date])
  @@index([currency, date(sort: Desc)])
  @@map("exchange-rate")
}
```

- Global reference data: **no `userId`**, no FK. Written only by the system command; read by any
  authenticated user.
- Identifier: UUID v7 (`@default(uuid(7))`). Natural key `(currency, date)` is what makes the cron
  idempotent (Principle VII, form b).
- Validation: `currency ∈ {USD, CLF}`; `value > 0`; `valueDate <= date`.
- State: no lifecycle. A row can only change by an upsert that raises `valueDate` (carried → real).

## Sin cambios de esquema en otras tablas

Pagar/prepagar una facturación USD usa columnas que la 028 ya dejó en el esquema:
`CreditStatement.currency`, `CreditStatement.settlementTransactionId`,
`Transaction.settlesStatementId`, `Transaction.currency`, `CardLimit` (uso derivado).
Verificar en la primera tarea que `db push` no necesita nada más.

## Contratos (resumen; ver `contracts/api.md`)

- `exchangeRateSchema { currency, date, value, valueDate }` + `carried = valueDate < date` (helper).
- `rateOn(rows, "YYYY-MM-DD")`: fila con mayor `date <=` la pedida, o `null`.
- `payCreditStatementSchema`/`prepayCreditStatementSchema`: `chargedAmount` (ya existe en `pay`, nuevo
  en `prepay`).

## Entidad no persistida

**Estimación**: `{ amount, rate, rateDate, carried }`, calculada en la web con `convertAmount`; nunca
viaja al API como tal.

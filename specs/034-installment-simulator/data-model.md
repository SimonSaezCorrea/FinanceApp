# Data Model: Simulador público de compra en cuotas

No hay tablas, migraciones ni entidades persistidas: todo vive en la página (FR-020). Lo que sigue
son los tipos del módulo puro `@finance/money/installment-simulation`. Todo monto y tasa viaja como
**cadena decimal** (Principio I).

## SimulationInput

| Campo                | Tipo                      | Regla                                         |
| -------------------- | ------------------------- | --------------------------------------------- |
| `price`              | decimal string            | > 0, ≤ 10^12, a la escala de `currency`       |
| `cashPrice`          | decimal string \| null    | opcional; > 0 y ≤ `price`                     |
| `currency`           | `"CLP" \| "CLF" \| "USD"` | por defecto CLP                               |
| `installments`       | entero                    | 1–60                                          |
| `monthlyRatePercent` | decimal string            | 0–10, ≤ 4 decimales ("2" = 2% mensual)        |
| `system`             | `"FIXED" \| "CONSTANT"`   | por defecto FIXED (francés)                   |
| `stampTaxPercent`    | decimal string            | 0–5; por defecto `stampTaxRate(installments)` |
| `fee`                | decimal string            | ≥ 0; por defecto "0"                          |

Validación: `validateSimulationInput(input) → { field, code }[]` (códigos `required`, `invalid`,
`tooLow`, `tooHigh`, `tooManyDecimals`, `aboveCashLimit`), compartida por la página y los tests.

## Derivados

- `stampTaxRate(n) = min(0.066 × n, 0.8)` (porcentaje).
- `stampTax = round(price × stampTaxPercent / 100)` (escala de la moneda).
- `costs = stampTax + fee`; `financed = price + costs`.

## ScheduleRow (salida, una por cuota)

| Campo       | Significado                                        |
| ----------- | -------------------------------------------------- |
| `sequence`  | 1..n                                               |
| `principal` | amortización del monto financiado                  |
| `interest`  | interés del mes sobre el saldo                     |
| `costs`     | parte de `principal` que corresponde a costos (R3) |
| `payment`   | `principal + interest`                             |
| `balance`   | saldo después de la cuota                          |

Invariantes: Σ principal = financed; Σ costs = costs; Σ payment = totalPaid; balance de la última = 0;
cada valor a la escala de la moneda.

## SimulationResult

| Campo                                                                | Significado                                                                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `schedule`                                                           | `ScheduleRow[]`                                                                                                  |
| `firstPayment`, `lastPayment`                                        | iguales salvo redondeo en FIXED; distintas en CONSTANT                                                           |
| `regularPayment`                                                     | en FIXED, la cuota de las filas 1..n-1 (o la única)                                                              |
| `totalPaid`, `totalInterest`, `stampTax`, `fee`, `costs`, `financed` | totales                                                                                                          |
| `caePercent`                                                         | CAE con 2 decimales (R1)                                                                                         |
| `otherSystemTotal`, `systemDifference`                               | total del otro sistema y `totalPaid − otherSystemTotal`                                                          |
| `cashComparison`                                                     | `{ cashPrice, extra, extraPercent, kind }`, `kind`: `SAME` (extra = 0), `MORE`, `COSTS_ONLY` (tasa 0 con costos) |

## Estado de la página (solo en memoria)

`touchedStampTax: boolean`: false hasta que la persona edita el impuesto; mientras sea false, el
impuesto sigue a `stampTaxRate(installments)`. "Usar la tasa legal" lo vuelve a false.

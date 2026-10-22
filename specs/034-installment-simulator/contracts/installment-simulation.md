# Contract: `@finance/money/installment-simulation`

Pure module (no I/O, no DOM), `decimal.js` inside. New subpath in `packages/money/package.json`
(`./installment-simulation` → `src/installmentSimulation.ts` / `dist/installmentSimulation.js`).

```ts
export type SimulationCurrency = "CLP" | "CLF" | "USD";
export type SimulationSystem = "FIXED" | "CONSTANT";

export function stampTaxRate(installments: number): string; // "0.396" for 6; "0.8" from 13

export function fixedPaymentSchedule(params: {
  totalPrincipal: string;
  installmentCount: number;
  ratePerPeriod: string; // decimal fraction: "0.02" = 2%
  currency: string;
}): ScheduleRow[]; // same ScheduleRow as equalPrincipalSchedule

export function validateSimulationInput(input: SimulationInput): SimulationIssue[];

/** Throws if validateSimulationInput would report any issue. */
export function simulateInstallments(input: SimulationInput): SimulationResult;

export function caePercent(received: string, payments: readonly string[]): string; // "27.43"
```

Types: see [data-model.md](../data-model.md). Guarantees:

- Every amount in the result is at `currencyScale(currency)` and the schedule sums exactly to the
  totals (FR-012, FR-013).
- `system: "CONSTANT"` calls `equalPrincipalSchedule` (the app's split), never a copy of it.
- Same input → same output in the build (Node) and in the browser.
- `caePercent` = monthly IRR × 12 × 100, 2 decimals (research R1); `"0.00"` when payments sum to
  `received`.

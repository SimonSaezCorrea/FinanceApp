import type { SimulationInput } from "@finance/money/installment-simulation";

/**
 * Spec 034 — the example the page is built with: its fields come filled with it and its result is
 * already in the HTML (what a crawler reads, and what a visitor sees before typing).
 * `stampTaxPercent` undefined = the legal rate for the term.
 */
export const DEFAULT_INPUT: SimulationInput = {
  price: "300000",
  cashPrice: null,
  currency: "CLP",
  installments: 6,
  monthlyRatePercent: "2",
  system: "FIXED",
  stampTaxPercent: undefined,
  fee: "",
};

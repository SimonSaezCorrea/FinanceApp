/**
 * ISO 4217's `CLF` (the Chilean Unidad de Fomento) reads as an unfamiliar code
 * to most users, who know it as "UF" — so a currency picker shows it as
 * "CLF (UF)" instead of the bare code, same as any other currency.
 */
export function currencyPickerLabel(code: string): string {
  return code === "CLF" ? "CLF (UF)" : code;
}

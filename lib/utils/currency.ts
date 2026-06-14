import Decimal from "decimal.js";

export const DEFAULT_CURRENCY = "USD";

export function parseMoneyInput(raw: string): Decimal | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) return null;
  try {
    const d = new Decimal(trimmed);
    return d;
  } catch {
    return null;
  }
}

export function assertSameCurrency(a: string, b: string) {
  if (a !== b) {
    throw new Error(`Currency mismatch: ${a} vs ${b}`);
  }
}

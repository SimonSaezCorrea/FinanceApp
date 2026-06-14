import Decimal from "decimal.js";

import { MONEY_SCALE, type MoneyInput, toMoney } from "./index";

/**
 * Interest math — single source of truth across the monorepo (Constitution
 * Principle I). All money results are returned as fixed-scale decimal STRINGS
 * (scale {@link MONEY_SCALE}, ROUND_HALF_EVEN) so precision survives the API
 * boundary. Rates are plain decimals (e.g. "0.05" for 5%) and may be passed as
 * a string or number.
 *
 * Ported from the legacy `lib/finance/interest.ts`. Behaviour is preserved; the
 * only change is that values cross out as strings instead of Decimal objects.
 */

/** A rate (e.g. "0.05" for 5%) accepted as a string, number, or Decimal. */
export type RateInput = MoneyInput;

export interface CompoundParams {
  principal: MoneyInput;
  /** Nominal annual rate as a decimal, e.g. "0.05" for 5%. */
  annualRate: RateInput;
  /** Compounding periods per year (positive integer-like number). */
  compoundsPerYear: number;
  /** Number of years (may be fractional). */
  years: MoneyInput;
}

/**
 * Compound interest future value: A = P * (1 + r/n)^(n*t).
 * @returns the future value as a fixed-scale money string.
 */
export function compoundFutureValue(params: CompoundParams): string {
  const P = toMoney(params.principal);
  const r = toMoney(params.annualRate);
  const n = params.compoundsPerYear;
  const t = toMoney(params.years);
  if (n <= 0 || !Number.isFinite(n)) {
    throw new Error("compoundsPerYear must be positive");
  }
  const ratePerPeriod = r.div(n);
  const factor = new Decimal(1).plus(ratePerPeriod).pow(n * t.toNumber());
  return P.mul(factor).toFixed(MONEY_SCALE, Decimal.ROUND_HALF_EVEN);
}

export interface SimpleInterestParams {
  principal: MoneyInput;
  /** Nominal annual rate as a decimal, e.g. "0.05" for 5%. */
  annualRate: RateInput;
  /** Number of years (may be fractional). */
  years: MoneyInput;
}

/**
 * Simple interest future value: P * (1 + r*t).
 * @returns the future value as a fixed-scale money string.
 */
export function simpleFutureValue(params: SimpleInterestParams): string {
  const P = toMoney(params.principal);
  const r = toMoney(params.annualRate);
  const t = toMoney(params.years);
  return P.mul(new Decimal(1).plus(r.mul(t))).toFixed(MONEY_SCALE, Decimal.ROUND_HALF_EVEN);
}

/**
 * Interest accrued (FV - P) under simple interest.
 * @returns the accrued interest as a fixed-scale money string.
 */
export function simpleInterestAccrued(params: SimpleInterestParams): string {
  const P = toMoney(params.principal);
  const r = toMoney(params.annualRate);
  const t = toMoney(params.years);
  // FV - P = P * (1 + r*t) - P = P * r * t
  return P.mul(r).mul(t).toFixed(MONEY_SCALE, Decimal.ROUND_HALF_EVEN);
}

/**
 * Monthly-equivalent rate from a nominal annual rate (simple division by 12).
 * This is a pure ratio, not money; returned as a decimal string at
 * {@link MONEY_SCALE} for consistency with the rest of the module.
 * @returns the monthly rate as a fixed-scale decimal string.
 */
export function nominalAnnualToMonthlyRate(annualRate: RateInput): string {
  return toMoney(annualRate).div(12).toFixed(MONEY_SCALE, Decimal.ROUND_HALF_EVEN);
}

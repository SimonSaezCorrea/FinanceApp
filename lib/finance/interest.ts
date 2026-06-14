import Decimal from "decimal.js";

export type CompoundParams = {
  principal: Decimal.Value;
  annualRate: Decimal.Value;
  compoundsPerYear: number;
  years: Decimal.Value;
};

/**
 * Compound interest: A = P * (1 + r/n)^(n*t)
 */
export function compoundFutureValue(params: CompoundParams): Decimal {
  const P = new Decimal(params.principal);
  const r = new Decimal(params.annualRate);
  const n = params.compoundsPerYear;
  const t = new Decimal(params.years);
  if (n <= 0 || !Number.isFinite(n)) throw new Error("compoundsPerYear must be positive");
  const ratePerPeriod = r.div(n);
  const factor = new Decimal(1).plus(ratePerPeriod).pow(n * t.toNumber());
  return P.mul(factor);
}

export type SimpleInterestParams = {
  principal: Decimal.Value;
  annualRate: Decimal.Value;
  years: Decimal.Value;
};

/** Simple interest: P * (1 + r*t) */
export function simpleFutureValue(params: SimpleInterestParams): Decimal {
  const P = new Decimal(params.principal);
  const r = new Decimal(params.annualRate);
  const t = new Decimal(params.years);
  return P.mul(new Decimal(1).plus(r.mul(t)));
}

/** Interest accrued (FV - P) under simple interest. */
export function simpleInterestAccrued(params: SimpleInterestParams): Decimal {
  const fv = simpleFutureValue(params);
  return fv.minus(new Decimal(params.principal));
}

/** Monthly-equivalent rate from nominal annual rate (simple division). */
export function nominalAnnualToMonthlyRate(annualRate: Decimal.Value): Decimal {
  return new Decimal(annualRate).div(12);
}

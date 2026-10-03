import Decimal from "decimal.js";

import { MONEY_SCALE, type MoneyInput, currencyScale, toMoney } from "./index";

export interface ScheduleRow {
  sequence: number;
  /** Equal-principal portion for this installment (decimal string). */
  principal: string;
  /** Simple interest on the outstanding balance when an APR/period is given. */
  interest: string;
  /** principal + interest (decimal string). */
  payment: string;
}

export interface ScheduleParams {
  totalPrincipal: MoneyInput;
  installmentCount: number;
  /** Optional nominal rate per period (e.g. monthly), as a decimal like "0.02". */
  aprPerPeriod?: MoneyInput;
  /** The schedule's currency: every instalment is rounded to its minor unit
   * (whole pesos for CLP), so none is an amount that can't be transferred.
   * Omitted, instalments keep MONEY_SCALE decimals. */
  currency?: string;
}

/**
 * Equal-principal amortization: each installment pays P/n of principal plus
 * optional simple interest on the outstanding balance. Single source of truth
 * for installment math (Constitution Principle I).
 *
 * Amounts are rounded to the currency's minor unit and the LAST instalment
 * absorbs the remainder — 64.990 CLP in 3 is 21.663 + 21.663 + 21.664, the way
 * an issuer bills it. Strings keep MONEY_SCALE digits ("21663.0000") so they
 * read the same as every other money value.
 */
export function equalPrincipalSchedule(params: ScheduleParams): ScheduleRow[] {
  const total = toMoney(params.totalPrincipal);
  const n = params.installmentCount;
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("installmentCount must be a positive integer");
  }
  if (total.lte(0)) {
    throw new Error("totalPrincipal must be positive");
  }

  const scale = params.currency ? currencyScale(params.currency) : MONEY_SCALE;
  const round = (d: Decimal) => new Decimal(d.toFixed(scale, Decimal.ROUND_HALF_EVEN));
  // Rounded equal share; the LAST installment absorbs the rounding remainder so
  // the principals sum exactly to the total.
  const baseRounded = round(total.div(n));
  const apr = params.aprPerPeriod != null ? toMoney(params.aprPerPeriod) : null;
  const rows: ScheduleRow[] = [];
  let allocated = new Decimal(0);
  let remaining = total;

  for (let i = 1; i <= n; i += 1) {
    const principal = i === n ? total.minus(allocated) : baseRounded;
    const interest = apr && !apr.isZero() ? round(remaining.mul(apr)) : new Decimal(0);
    rows.push({
      sequence: i,
      principal: principal.toFixed(MONEY_SCALE, Decimal.ROUND_HALF_EVEN),
      interest: interest.toFixed(MONEY_SCALE, Decimal.ROUND_HALF_EVEN),
      payment: principal.plus(interest).toFixed(MONEY_SCALE, Decimal.ROUND_HALF_EVEN),
    });
    allocated = allocated.plus(principal);
    remaining = remaining.minus(principal);
    if (remaining.lt(0)) remaining = new Decimal(0);
  }

  return rows;
}

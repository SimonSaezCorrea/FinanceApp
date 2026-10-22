import Decimal from "decimal.js";

import { MONEY_SCALE, type MoneyInput, currencyScale, toMoney } from "./index";
import { type ScheduleRow, equalPrincipalSchedule } from "./installments";

/**
 * Spec 034 — the public instalment simulator's arithmetic: one pure module, used at build time
 * (the solved example written into the page's HTML) and in the browser (loaded after first paint).
 * Every amount and rate is a decimal string computed with `decimal.js` (Principle I).
 */

export type SimulationCurrency = "CLP" | "CLF" | "USD";
/** FIXED = cuota fija (French system, what lenders quote); CONSTANT = capital constante. */
export type SimulationSystem = "FIXED" | "CONSTANT";

export interface SimulationInput {
  price: string;
  /** Optional cash price to compare against (≤ price); omitted/empty = the price. */
  cashPrice?: string | null;
  currency: SimulationCurrency;
  /** Whole number of monthly instalments; null when the field is empty. */
  installments: number | null;
  /** Monthly interest rate in percent ("2" = 2%). */
  monthlyRatePercent: string;
  system: SimulationSystem;
  /** Stamp tax in percent; undefined = the legal rate for the term, "" = none. */
  stampTaxPercent?: string;
  /** Fixed fee or insurance; "" or undefined = none. */
  fee?: string;
}

export type SimulationField =
  "price" | "cashPrice" | "installments" | "monthlyRatePercent" | "stampTaxPercent" | "fee";

export type SimulationIssueCode =
  "required" | "invalid" | "tooLow" | "tooHigh" | "tooManyDecimals" | "aboveCashLimit";

export interface SimulationIssue {
  field: SimulationField;
  code: SimulationIssueCode;
}

/** One instalment of the simulation, every amount at the currency's minor unit. */
export interface SimulationRow {
  sequence: number;
  /** Amortization of the financed amount (price + costs). */
  principal: string;
  interest: string;
  /** The part of `principal` that repays the stamp tax and fee. */
  costs: string;
  /** principal + interest. */
  payment: string;
  /** What is still owed after this instalment. */
  balance: string;
}

export type CashComparisonKind = "SAME" | "COSTS_ONLY" | "MORE";

export interface SimulationResult {
  schedule: SimulationRow[];
  firstPayment: string;
  /** The instalment every row but the last pays (cuota fija); the first one in CONSTANT. */
  regularPayment: string;
  lastPayment: string;
  totalPaid: string;
  totalInterest: string;
  stampTax: string;
  /** The stamp tax rate actually used, in percent. */
  stampTaxPercent: string;
  fee: string;
  costs: string;
  financed: string;
  /** Carga anual equivalente, percent with 2 decimals (DS 43: monthly rate × 12). */
  caePercent: string;
  /** Total paid under the OTHER system, and this total minus it. */
  otherSystemTotal: string;
  systemDifference: string;
  cashComparison: {
    cashPrice: string;
    extra: string;
    extraPercent: string;
    kind: CashComparisonKind;
  };
}

export const SIMULATION_LIMITS = {
  maxInstallments: 60,
  maxMonthlyRatePercent: "10",
  maxRateDecimals: 4,
  maxStampTaxPercent: "5",
  maxAmount: "1000000000000",
} as const;

/** Impuesto de timbres y estampillas (DL 3.475, art. 1 N°3): 0,066% per month, at most 0,8%. */
const STAMP_TAX_PER_MONTH = new Decimal("0.066");
const STAMP_TAX_CAP = new Decimal("0.8");

/** The legal stamp tax for a term of `installments` months, in percent ("0.396" for 6). */
export function stampTaxRate(installments: number): string {
  return Decimal.min(STAMP_TAX_PER_MONTH.times(installments), STAMP_TAX_CAP).toString();
}

const roundTo = (value: Decimal, scale: number) =>
  new Decimal(value.toFixed(scale, Decimal.ROUND_HALF_EVEN));
const asMoneyString = (value: Decimal) => value.toFixed(MONEY_SCALE, Decimal.ROUND_HALF_EVEN);

/**
 * Cuota fija (French system): the same instalment every month, interest on the balance, the LAST
 * instalment absorbing the rounding (Principle I). The one implementation of this system; the
 * output has `equalPrincipalSchedule`'s shape. Without interest it IS `equalPrincipalSchedule`.
 */
export function fixedPaymentSchedule(params: {
  totalPrincipal: MoneyInput;
  installmentCount: number;
  /** Rate per period as a fraction ("0.02" = 2% a month). */
  ratePerPeriod: MoneyInput;
  currency: string;
}): ScheduleRow[] {
  const total = toMoney(params.totalPrincipal);
  const n = params.installmentCount;
  const rate = toMoney(params.ratePerPeriod);
  if (!Number.isInteger(n) || n <= 0)
    throw new Error("installmentCount must be a positive integer");
  if (total.lte(0)) throw new Error("totalPrincipal must be positive");
  if (rate.isNegative()) throw new Error("ratePerPeriod must not be negative");
  if (rate.isZero()) {
    return equalPrincipalSchedule({
      totalPrincipal: total,
      installmentCount: n,
      currency: params.currency,
    });
  }

  const scale = currencyScale(params.currency);
  const factor = new Decimal(1).minus(rate.plus(1).pow(-n));
  const payment = roundTo(total.times(rate).div(factor), scale);
  const rows: ScheduleRow[] = [];
  let balance = total;
  for (let i = 1; i <= n; i += 1) {
    const interest = roundTo(balance.times(rate), scale);
    const principal = i === n ? balance : payment.minus(interest);
    rows.push({
      sequence: i,
      principal: asMoneyString(principal),
      interest: asMoneyString(interest),
      payment: asMoneyString(principal.plus(interest)),
    });
    balance = balance.minus(principal);
  }
  return rows;
}

/**
 * Carga anual equivalente (DS 43/2012, ecuaciones 1 y 2): the monthly rate i that makes the
 * present value of every payment equal what was received, times 12 (not compounded). Percent with
 * 2 decimals. Bisection: always converges, whatever the costs.
 */
export function caePercent(received: MoneyInput, payments: readonly MoneyInput[]): string {
  const target = toMoney(received);
  const flows = payments.map(toMoney);
  const presentValue = (rate: Decimal) => {
    const discount = new Decimal(1).div(rate.plus(1));
    let factor = new Decimal(1);
    let total = new Decimal(0);
    for (const flow of flows) {
      factor = factor.times(discount);
      total = total.plus(flow.times(factor));
    }
    return total;
  };
  if (presentValue(new Decimal(0)).lte(target)) return "0.00";

  let low = new Decimal(0);
  let high = new Decimal(1);
  for (let i = 0; i < 64 && presentValue(high).gt(target); i += 1) {
    low = high;
    high = high.times(2);
  }
  const tolerance = new Decimal("1e-12");
  for (let i = 0; i < 200 && high.minus(low).gt(tolerance.times(high.plus(1))); i += 1) {
    const mid = low.plus(high).div(2);
    if (presentValue(mid).gt(target)) low = mid;
    else high = mid;
  }
  return low.plus(high).div(2).times(1200).toFixed(2, Decimal.ROUND_HALF_UP);
}

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

function decimalsOf(value: string): number {
  return value.split(".")[1]?.length ?? 0;
}

/** Field-level checks shared by the page and the tests (spec 034, FR-014). */
export function validateSimulationInput(input: SimulationInput): SimulationIssue[] {
  const issues: SimulationIssue[] = [];
  const scale = currencyScale(input.currency);
  const max = new Decimal(SIMULATION_LIMITS.maxAmount);

  const amount = (field: SimulationField, raw: string | null | undefined, required: boolean) => {
    const value = raw?.trim() ?? "";
    if (value === "") {
      if (required) issues.push({ field, code: "required" });
      return null;
    }
    if (!DECIMAL_PATTERN.test(value)) {
      issues.push({ field, code: "invalid" });
      return null;
    }
    const n = new Decimal(value);
    if (n.isNegative()) issues.push({ field, code: "tooLow" });
    else if (n.gt(max)) issues.push({ field, code: "tooHigh" });
    else return n;
    return null;
  };

  const price = amount("price", input.price, true);
  if (price) {
    if (price.isZero()) issues.push({ field: "price", code: "tooLow" });
    else if (decimalsOf(input.price.trim()) > scale)
      issues.push({ field: "price", code: "tooManyDecimals" });
  }

  const n = input.installments;
  if (n === null || Number.isNaN(n)) issues.push({ field: "installments", code: "required" });
  else if (!Number.isInteger(n)) issues.push({ field: "installments", code: "invalid" });
  else if (n < 1) issues.push({ field: "installments", code: "tooLow" });
  else if (n > SIMULATION_LIMITS.maxInstallments)
    issues.push({ field: "installments", code: "tooHigh" });

  const rate = amount("monthlyRatePercent", input.monthlyRatePercent, true);
  if (rate) {
    if (rate.gt(SIMULATION_LIMITS.maxMonthlyRatePercent))
      issues.push({ field: "monthlyRatePercent", code: "tooHigh" });
    else if (decimalsOf(input.monthlyRatePercent.trim()) > SIMULATION_LIMITS.maxRateDecimals)
      issues.push({ field: "monthlyRatePercent", code: "tooManyDecimals" });
  }

  const tax = amount("stampTaxPercent", input.stampTaxPercent, false);
  if (tax?.gt(SIMULATION_LIMITS.maxStampTaxPercent))
    issues.push({ field: "stampTaxPercent", code: "tooHigh" });

  const fee = amount("fee", input.fee, false);
  if (fee && decimalsOf(input.fee!.trim()) > scale)
    issues.push({ field: "fee", code: "tooManyDecimals" });

  const cash = amount("cashPrice", input.cashPrice, false);
  if (cash) {
    if (cash.isZero()) issues.push({ field: "cashPrice", code: "tooLow" });
    else if (price && cash.gt(price)) issues.push({ field: "cashPrice", code: "aboveCashLimit" });
    else if (decimalsOf(input.cashPrice!.trim()) > scale)
      issues.push({ field: "cashPrice", code: "tooManyDecimals" });
  }

  return issues;
}

function scheduleFor(
  system: SimulationSystem,
  financed: Decimal,
  n: number,
  rate: Decimal,
  currency: string,
): ScheduleRow[] {
  return system === "FIXED"
    ? fixedPaymentSchedule({
        totalPrincipal: financed,
        installmentCount: n,
        ratePerPeriod: rate,
        currency,
      })
    : equalPrincipalSchedule({
        totalPrincipal: financed,
        installmentCount: n,
        aprPerPeriod: rate,
        currency,
      });
}

const totalOf = (rows: ScheduleRow[]) =>
  rows.reduce((acc, row) => acc.plus(row.payment), new Decimal(0));

/** The whole simulation (spec 034). Throws when `validateSimulationInput` reports any issue. */
export function simulateInstallments(input: SimulationInput): SimulationResult {
  const issues = validateSimulationInput(input);
  if (issues.length > 0) {
    throw new Error(
      `Invalid simulation input: ${issues.map((i) => `${i.field}:${i.code}`).join(", ")}`,
    );
  }
  const scale = currencyScale(input.currency);
  const str = (value: Decimal) => value.toFixed(scale, Decimal.ROUND_HALF_EVEN);
  const n = input.installments!;
  const price = new Decimal(input.price.trim());
  const rate = new Decimal(input.monthlyRatePercent.trim()).div(100);

  const taxPercent =
    input.stampTaxPercent === undefined
      ? stampTaxRate(n)
      : input.stampTaxPercent.trim() === ""
        ? "0"
        : new Decimal(input.stampTaxPercent.trim()).toString();
  const stampTax = roundTo(price.times(taxPercent).div(100), scale);
  const fee = input.fee?.trim() ? new Decimal(input.fee.trim()) : new Decimal(0);
  const costs = stampTax.plus(fee);
  const financed = price.plus(costs);

  const raw = scheduleFor(input.system, financed, n, rate, input.currency);
  const other = scheduleFor(
    input.system === "FIXED" ? "CONSTANT" : "FIXED",
    financed,
    n,
    rate,
    input.currency,
  );

  // The costs' share of each instalment's principal; the last row absorbs the rounding so the
  // column sums exactly to the costs (research R3).
  let costsLeft = costs;
  let balance = financed;
  const schedule: SimulationRow[] = raw.map((row, index) => {
    const principal = new Decimal(row.principal);
    const share =
      index === raw.length - 1 || financed.isZero()
        ? costsLeft
        : roundTo(principal.times(costs).div(financed), scale);
    costsLeft = costsLeft.minus(share);
    balance = balance.minus(principal);
    return {
      sequence: row.sequence,
      principal: str(principal),
      interest: str(new Decimal(row.interest)),
      costs: str(share),
      payment: str(new Decimal(row.payment)),
      balance: str(balance),
    };
  });

  const totalPaid = totalOf(raw);
  const otherTotal = totalOf(other);
  const totalInterest = raw.reduce((acc, row) => acc.plus(row.interest), new Decimal(0));

  const cashRaw = input.cashPrice?.trim();
  const cashPrice = cashRaw ? new Decimal(cashRaw) : price;
  const extra = totalPaid.minus(cashPrice);
  const kind: CashComparisonKind = extra.isZero()
    ? "SAME"
    : rate.isZero() && cashPrice.eq(price) && extra.eq(costs)
      ? "COSTS_ONLY"
      : "MORE";

  return {
    schedule,
    firstPayment: schedule[0]!.payment,
    regularPayment: schedule[0]!.payment,
    lastPayment: schedule[schedule.length - 1]!.payment,
    totalPaid: str(totalPaid),
    totalInterest: str(totalInterest),
    stampTax: str(stampTax),
    stampTaxPercent: taxPercent,
    fee: str(fee),
    costs: str(costs),
    financed: str(financed),
    caePercent: caePercent(
      price,
      raw.map((row) => row.payment),
    ),
    otherSystemTotal: str(otherTotal),
    systemDifference: str(totalPaid.minus(otherTotal)),
    cashComparison: {
      cashPrice: str(cashPrice),
      extra: str(extra),
      extraPercent: extra.div(cashPrice).times(100).toFixed(2, Decimal.ROUND_HALF_UP),
      kind,
    },
  };
}

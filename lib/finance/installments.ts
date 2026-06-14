import Decimal from "decimal.js";

export type InstallmentScheduleRow = {
  sequence: number;
  /** Principal portion for this cuota (equal principal split). */
  principal: Decimal;
  /** Derived fee/interest per row when apr supplied (simple interest on remaining balance). */
  interest: Decimal;
  /** principal + interest */
  payment: Decimal;
  /** Remaining principal after this payment (before payment applied for display). */
  remainingBefore: Decimal;
};

export type BuildEqualPrincipalScheduleParams = {
  totalPrincipal: Decimal.Value;
  installmentCount: number;
  /** Optional nominal APR per period (e.g. monthly rate if periods are months). */
  aprPerPeriod?: Decimal.Value;
};

/**
 * Equal principal amortization: each installment pays P/n principal plus
 * optional simple interest on the outstanding balance at the start of the period.
 */
export function buildEqualPrincipalSchedule(
  params: BuildEqualPrincipalScheduleParams,
): InstallmentScheduleRow[] {
  const principalTotal = new Decimal(params.totalPrincipal);
  const n = params.installmentCount;
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error("installmentCount must be a positive integer");
  }
  if (principalTotal.lte(0)) {
    throw new Error("totalPrincipal must be positive");
  }

  const basePrincipal = principalTotal.div(n);
  const apr = params.aprPerPeriod != null ? new Decimal(params.aprPerPeriod) : null;

  const rows: InstallmentScheduleRow[] = [];
  let remaining = principalTotal;

  for (let i = 1; i <= n; i += 1) {
    const isLast = i === n;
    const principalPayment = isLast ? remaining : Decimal.min(basePrincipal, remaining);
    const interestPayment =
      apr && !apr.isZero() ? remaining.mul(apr) : new Decimal(0);
    const payment = principalPayment.plus(interestPayment);

    rows.push({
      sequence: i,
      principal: principalPayment,
      interest: interestPayment,
      payment,
      remainingBefore: remaining,
    });

    remaining = remaining.minus(principalPayment);
    if (remaining.lt(0)) remaining = new Decimal(0);
  }

  return rows;
}

export function sumPayments(schedule: InstallmentScheduleRow[]): Decimal {
  return schedule.reduce((acc, row) => acc.plus(row.payment), new Decimal(0));
}

import { addMoney, moneyToString, subtractMoney, sumMoney, toMoney } from "@finance/money";

/**
 * The arithmetic of the installment carry-over — pure, no persistence, no Prisma.
 *
 * The rule: paying an installment NEVER rewrites the schedule (FR-020). What a
 * payment fails to cover is carried into the next unpaid installment as a figure of
 * its own (FR-021), and what it covers in excess is subtracted from it, flowing on
 * through later installments while it lasts (FR-021a). It is the same mechanism
 * `CreditStatement.carriedOverAmount` already uses when a statement payment falls
 * short — deliberately, so the application has one explanation for "what you didn't
 * cover", not two.
 *
 * The one asymmetry worth knowing: a short payment on an installment that HAS a
 * successor settles that installment and moves the shortfall onward, so the debt
 * lives in exactly one place. The LAST unpaid installment has nowhere to move it, so
 * it is NOT settled: it keeps its partial credit and stays payable for the remainder
 * (FR-023). Modelling it the other way — settled but still owing — would let the same
 * shortfall be counted both on the installment and on its carry.
 */

export interface CarryablePayment {
  sequence: number;
  /** The SCHEDULED amount. Never modified here. */
  amount: string;
  /** Inherited from the previous installment; negative when that one was overpaid. */
  carriedOverAmount: string;
  paidAt: Date | null;
  paidAmount: string | null;
}

/** A change to one installment's `carriedOverAmount`, to be applied by the caller. */
export interface CarryDelta {
  sequence: number;
  /** moneyString; positive adds debt, negative removes it. */
  delta: string;
}

export interface CarryOverResult {
  /** Whether the paid installment is fully covered and can be marked paid. */
  settled: boolean;
  /** What this payment left uncovered on its own installment (0 when settled). */
  shortfall: string;
  /** Surplus with no later installment to absorb it — the caller must reject it (FR-021b). */
  unappliedSurplus: string;
  /** Changes to apply to later installments, in sequence order. */
  deltas: CarryDelta[];
}

/** What an installment owes: scheduled + carried in, floored at zero (FR-022). */
export function owedBy(payment: Pick<CarryablePayment, "amount" | "carriedOverAmount">): string {
  const owed = toMoney(addMoney(payment.amount, payment.carriedOverAmount));
  return moneyToString(owed.greaterThan(0) ? owed : 0);
}

/** An installment is outstanding until it is settled; a partially credited last one
 *  still owes the difference. */
export function outstandingOn(payment: CarryablePayment): string {
  if (payment.paidAt !== null) return "0.0000";
  return moneyToString(maxMoney(subtractMoney(owedBy(payment), payment.paidAmount ?? "0"), "0"));
}

/** Everything the plan still owes — the figure the UI calls "restante". */
export function outstandingTotal(payments: CarryablePayment[]): string {
  return sumMoney(payments.map(outstandingOn));
}

/**
 * Computes what paying `paidAmount` against installment `sequence` does, WITHOUT
 * mutating anything: the caller applies `deltas` inside its own transaction, so that
 * the same computation can be tested with no database in sight.
 */
export function applyCarryOver(
  payments: CarryablePayment[],
  sequence: number,
  paidAmount: string,
): CarryOverResult {
  const target = payments.find((p) => p.sequence === sequence);
  if (!target) throw new Error(`installment ${sequence} not found`);

  const owed = owedBy(target);
  const difference = toMoney(subtractMoney(paidAmount, owed));

  // Paid exactly what was owed: nothing moves.
  if (difference.isZero()) {
    return { settled: true, shortfall: "0.0000", unappliedSurplus: "0.0000", deltas: [] };
  }

  const later = laterUnpaid(payments, sequence);

  if (difference.isNegative()) {
    const shortfall = moneyToString(difference.negated());
    // No successor to carry into: the installment keeps its partial credit and stays
    // payable (FR-023). Settling it here is what would forgive the difference.
    if (later.length === 0) {
      return { settled: false, shortfall, unappliedSurplus: "0.0000", deltas: [] };
    }
    return {
      settled: true,
      shortfall: "0.0000",
      unappliedSurplus: "0.0000",
      deltas: [{ sequence: later[0].sequence, delta: shortfall }],
    };
  }

  // Surplus: walk forward absorbing whole installments until it runs out (FR-021a).
  let surplus = difference;
  const deltas: CarryDelta[] = [];
  for (const next of later) {
    if (surplus.lessThanOrEqualTo(0)) break;
    const nextOwed = toMoney(owedBy(next));
    // An installment can be reduced to zero owed, never past it.
    const absorbed = surplus.greaterThan(nextOwed) ? nextOwed : surplus;
    if (absorbed.greaterThan(0)) {
      deltas.push({ sequence: next.sequence, delta: moneyToString(absorbed.negated()) });
      surplus = surplus.minus(absorbed);
    }
  }

  return {
    settled: true,
    shortfall: "0.0000",
    unappliedSurplus: moneyToString(surplus),
    deltas,
  };
}

/**
 * The deltas that undo a payment (FR-024) — the exact opposite of what it applied.
 *
 * Note what this does NOT return: anything about the carry the undone installment
 * itself RECEIVED. That belongs to the earlier payment, which still stands.
 */
export function reverseCarryOver(deltas: CarryDelta[]): CarryDelta[] {
  return deltas.map(({ sequence, delta }) => ({
    sequence,
    delta: moneyToString(toMoney(delta).negated()),
  }));
}

/** Unpaid installments after `sequence`, in order — an intermediate one may already
 *  be paid, since undoing allows paying out of order (FR-021c). */
function laterUnpaid(payments: CarryablePayment[], sequence: number): CarryablePayment[] {
  return payments
    .filter((p) => p.sequence > sequence && p.paidAt === null)
    .sort((a, b) => a.sequence - b.sequence);
}

function maxMoney(a: string, b: string): string {
  return toMoney(a).greaterThan(toMoney(b)) ? a : b;
}

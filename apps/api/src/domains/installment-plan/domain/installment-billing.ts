import { addMoney, moneyToString, toMoney } from "@finance/money";

/**
 * One instalment eligible to be considered for billing: due, unbilled so far, on a
 * plan whose card belongs to the account whose period is closing (that scoping is the
 * caller's query, not this function's business — see `research.md` R1/Constitution
 * VI: this domain decides the RULE, the repository decides the JOIN).
 */
export interface BillableCandidate {
  planId: string;
  paymentId: string;
  sequence: number;
  dueDate: Date;
  amount: string;
  currency: string;
  /** Already billed by an earlier close — must be null to be selected at all. */
  creditStatementId: string | null;
}

export interface BillableSelection {
  paymentIds: string[];
  total: string;
  count: number;
  /** Plan ids skipped because their currency doesn't match the account's — reported
   * so the caller can raise the FR-023a warning. One entry per plan, not per
   * instalment. */
  skippedForCurrency: string[];
}

/**
 * Which of a set of candidate instalments a period closing at `closedAt` charges
 * (FR-008, FR-009, FR-013b).
 *
 * Pure and I/O-free: "exactly once, ever, across periods that may never have been
 * generated" (SC-003) has to be provable without a database. Idempotent by
 * construction — a candidate carrying `creditStatementId` is filtered out before
 * anything else, so re-running this over the same candidates twice selects nothing
 * the second time.
 */
export function selectBillableInstallments(input: {
  candidates: BillableCandidate[];
  closedAt: Date;
  accountCurrency: string;
}): BillableSelection {
  const skippedForCurrency = new Set<string>();
  const selected: BillableCandidate[] = [];

  for (const candidate of input.candidates) {
    if (candidate.creditStatementId !== null) continue; // already billed — never twice
    if (candidate.dueDate.getTime() > input.closedAt.getTime()) continue; // not due yet
    if (candidate.currency !== input.accountCurrency) {
      // FR-009a: no FX in this app. Billing it would mean inventing a rate.
      skippedForCurrency.add(candidate.planId);
      continue;
    }
    selected.push(candidate);
  }

  return {
    paymentIds: selected.map((c) => c.paymentId),
    total: selected.reduce((sum, c) => addMoney(sum, c.amount), moneyToString("0")),
    count: selected.length,
    skippedForCurrency: [...skippedForCurrency],
  };
}

/** Re-exported for callers that only need the zero-check without importing decimal.js
 * directly (kept trivial on purpose — this is the only place `toMoney` would add
 * anything selectBillableInstallments doesn't already give as `count === 0`). */
export function hasBillable(selection: BillableSelection): boolean {
  return selection.count > 0 || toMoney(selection.total).greaterThan(0);
}

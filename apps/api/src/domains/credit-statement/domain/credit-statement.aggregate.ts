import { addMoney, moneyToString, subtractMoney, toMoney } from "@finance/money";

import {
  InvalidPaymentAmountError,
  PaymentExceedsRemainingError,
  StatementAlreadyPaidError,
} from "./errors";
import { StatementClosedEvent } from "./events/statement-closed.event";
import { StatementPaidEvent } from "./events/statement-paid.event";
import type { CreditStatementState } from "./states/credit-statement-state";
import { OpenState } from "./states/open-state";
import { PaidState } from "./states/paid-state";
import { PartiallyPaidState } from "./states/partially-paid-state";
import { PendingState } from "./states/pending-state";

export interface CreditStatementProps {
  id: string;
  accountId: string;
  periodStart: Date;
  closedAt: Date | null;
  paidAt: Date | null;
  /** Frozen only once PAID; while OPEN/PENDING this is the live linked-transactions
   * sum, supplied by the repository adapter (see `sumLinkedTransactions`). */
  amount: string;
  /** Settled so far, accumulated across payments ("0" until the first one). */
  paidAmount: string;
  paidFromAccountId: string | null;
  paidTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `CreditStatement` (State pattern, FR-005): a billing period for an
 * account's shared credit pool. Lifecycle OPEN -> PENDING -> PAID, each stage
 * delegating "is this allowed right now" to its own state object — see
 * `domain/states/`.
 */
export class CreditStatement {
  private constructor(private props: CreditStatementProps) {}

  static fromPersistence(props: CreditStatementProps): CreditStatement {
    return new CreditStatement({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get accountId(): string {
    return this.props.accountId;
  }

  get periodStart(): Date {
    return this.props.periodStart;
  }

  get closedAt(): Date | null {
    return this.props.closedAt;
  }

  get paidAt(): Date | null {
    return this.props.paidAt;
  }

  get amount(): string {
    return moneyToString(this.props.amount);
  }

  get paidAmount(): string {
    return moneyToString(this.props.paidAmount);
  }

  /**
   * Still owed for this period, given its total.
   *
   * The total is passed IN rather than read from `props.amount`: until a period
   * is settled its amount isn't stored at all — it's the live sum of its linked
   * transactions, which only the repository can produce. Freezing it early is
   * exactly the bug this avoids.
   */
  remainingFor(periodAmount: string): string {
    const remaining = subtractMoney(periodAmount, this.props.paidAmount);
    return toMoney(remaining).isNegative() ? moneyToString("0") : remaining;
  }

  get paidFromAccountId(): string | null {
    return this.props.paidFromAccountId;
  }

  get paidTransactionId(): string | null {
    return this.props.paidTransactionId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Derived from `closedAt`/`paidAt`/`paidAmount` — no stored `status` column. */
  get state(): CreditStatementState {
    if (this.props.paidAt) return new PaidState();
    // Paid into but not settled. Checked before `closedAt` only for readability —
    // a payment always closes the period, so both hold by this point.
    if (toMoney(this.props.paidAmount).greaterThan(0)) return new PartiallyPaidState();
    if (this.props.closedAt) return new PendingState();
    return new OpenState();
  }

  toPersistenceState(): CreditStatementProps {
    return { ...this.props };
  }

  /** Seals an OPEN statement (generation, manual or cron). Eligibility/due-date
   * gating happens in the caller (via `BillingEligibilityStrategy` +
   * `nextBoundaryAfter`) before this is called — the aggregate only enforces
   * the state-machine part of the rule. */
  close(closedAt: Date): StatementClosedEvent {
    if (!this.state.canClose()) {
      throw new StatementAlreadyPaidError();
    }
    this.props.closedAt = closedAt;
    return new StatementClosedEvent(this.accountId, this.id, this.periodStart, closedAt);
  }

  /**
   * Pay into this statement.
   *
   * A period can be settled in several payments, so this ACCUMULATES rather than
   * flipping a flag: `paidAmount` grows, and only when it reaches the period's
   * total does `paidAt` get stamped and the amount freeze. Until then the
   * statement stays payable and its amount stays live.
   *
   * `amount` must be positive and must not exceed what's still owed — an
   * overpayment is rejected, not capped (`PaymentExceedsRemainingError`): a wrong
   * figure in a money form must never be quietly "corrected". Paying an OPEN
   * period closes it, as before.
   */
  payTowards(
    periodAmount: string,
    amount: string,
    fromAccountId: string,
    paymentTransactionId: string,
    when: Date,
  ): StatementPaidEvent {
    if (!this.state.canPay()) {
      throw new StatementAlreadyPaidError();
    }
    const paying = toMoney(amount);
    if (paying.lessThanOrEqualTo(0)) {
      throw new InvalidPaymentAmountError();
    }
    if (paying.greaterThan(toMoney(this.remainingFor(periodAmount)))) {
      throw new PaymentExceedsRemainingError();
    }

    this.props.paidAmount = addMoney(this.props.paidAmount, amount);
    if (toMoney(this.props.paidAmount).greaterThanOrEqualTo(toMoney(periodAmount))) {
      // Settled: freeze the period's total and stamp the date. A partial payment
      // leaves both untouched, which is what keeps the period payable.
      this.props.amount = moneyToString(periodAmount);
      this.props.paidAt = when;
    }
    // The LAST payment is the one recorded here: with several payments this points
    // at the most recent movement, not at all of them (documented simplification —
    // every payment is still a real Transaction of its own).
    this.props.paidFromAccountId = fromAccountId;
    this.props.paidTransactionId = paymentTransactionId;
    this.props.closedAt = this.props.closedAt ?? when;
    return new StatementPaidEvent(
      this.accountId,
      this.id,
      moneyToString(amount),
      fromAccountId,
      paymentTransactionId,
    );
  }

  /**
   * Reconcile this period against what its movements actually say.
   *
   * Replaces the periods's own figure with `recomputedAmount` — the sum of the
   * transactions that fall inside the period's date window, recomputed by the
   * caller. This is the ONLY way a settled period's frozen amount changes: the
   * old manual "correct the amount" typed a number in by hand, which could agree
   * with nothing.
   *
   * A settled period stays settled: `paidAmount` follows the new total, so the
   * payment movement can be updated to match (the caller does that, inside the
   * same database transaction). The returned delta is what the payment must
   * change by — positive when the period turned out bigger than what was paid —
   * and it is what the account's `creditUsed` has to be corrected by too, since
   * editing a transaction of an already-paid period deliberately leaves the pool
   * alone at edit time.
   *
   * For an unsettled period this only fixes the stored figure: its amount is the
   * live sum anyway, so nothing else moves.
   */
  syncAmount(recomputedAmount: string): { previousPaidAmount: string; paidDelta: string } {
    const previousPaidAmount = this.paidAmount;
    this.props.amount = moneyToString(recomputedAmount);
    if (!this.props.paidAt) {
      return { previousPaidAmount, paidDelta: moneyToString("0") };
    }
    this.props.paidAmount = moneyToString(recomputedAmount);
    return {
      previousPaidAmount,
      paidDelta: subtractMoney(this.props.paidAmount, previousPaidAmount),
    };
  }
}

import { addMoney, moneyToString, subtractMoney, toMoney } from "@finance/money";

import {
  InvalidPaymentAmountError,
  PaymentExceedsRemainingError,
  StatementAlreadyPaidError,
  StatementNotPaidError,
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
  /** What was actually paid for this period ("0" until it is paid). May be less
   * than the period's total — the rest is carried into the next period. */
  paidAmount: string;
  /** Debt brought forward from the previous period (part of what this one owes). */
  carriedOverAmount: string;
  /** The period this one's leftover was rolled into, if any. */
  carriedToId: string | null;
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

  get carriedOverAmount(): string {
    return moneyToString(this.props.carriedOverAmount);
  }

  get carriedToId(): string | null {
    return this.props.carriedToId;
  }

  /**
   * What this period owes in total: its own movements plus whatever the previous
   * period left unpaid. The movements' sum is passed IN for the same reason
   * `remainingFor` takes it — until the period is settled it isn't stored.
   *
   * Spec 014, FR-010: `instalmentAmount` is the third summand — what this period
   * charged from instalment plans, stamped separately from `linkedAmount`'s ordinary
   * movements (a plan's PURCHASE movement is deliberately excluded from
   * `linkedAmount`; only its SCHEDULE bills here, one instalment at a time —
   * `research.md` R1/R4). Defaults to "0" so every pre-existing call site (a
   * non-credit-card period never has instalments to add) keeps behaving exactly as
   * before without having to pass it.
   */
  totalFor(linkedAmount: string, instalmentAmount = "0"): string {
    return addMoney(addMoney(linkedAmount, this.props.carriedOverAmount), instalmentAmount);
  }

  /** Receives the leftover of the period that came before it. Accumulates:
   * two periods in a row can each roll their remainder into the same open one. */
  receiveCarryOver(amount: string): void {
    this.props.carriedOverAmount = addMoney(this.props.carriedOverAmount, amount);
  }

  /** Records where this period's leftover went (its successor's id). */
  markCarriedTo(statementId: string): void {
    this.props.carriedToId = statementId;
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

  /** Derived from `closedAt`/`paidAt`/`paidAmount` — no stored `status` column.
   * A settled period whose payment fell short of its frozen total reports
   * PARTIALLY_PAID: any payment settles the period (see `payTowards`), so this is
   * a label on a terminal state, not a payable stage of its own. */
  get state(): CreditStatementState {
    if (this.props.paidAt) {
      return toMoney(this.props.paidAmount).lessThan(toMoney(this.props.amount))
        ? new PartiallyPaidState()
        : new PaidState();
    }
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
   * Pay this statement — in full, the minimum, or any amount in between.
   *
   * ANY payment settles the period: `paidAt` is stamped, the total freezes, and
   * whatever wasn't covered is returned as `carryOver` for the caller to roll into
   * the next period (which is where it will be owed from now on — a period never
   * stays half-payable). This mirrors how a real card statement works.
   *
   * `amount` must be positive and must not exceed what's owed — an overpayment is
   * rejected, not capped (`PaymentExceedsRemainingError`): a wrong figure in a
   * money form must never be quietly "corrected". Paying an OPEN period closes it.
   */
  payTowards(
    periodAmount: string,
    amount: string,
    fromAccountId: string,
    paymentTransactionId: string,
    when: Date,
  ): { event: StatementPaidEvent; carryOver: string } {
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

    // Closed and settled whatever the size of the payment: the period's total
    // freezes here, and the shortfall becomes the next period's problem.
    this.props.paidAmount = moneyToString(amount);
    this.props.amount = moneyToString(periodAmount);
    this.props.paidAt = when;
    this.props.paidFromAccountId = fromAccountId;
    this.props.paidTransactionId = paymentTransactionId;
    this.props.closedAt = this.props.closedAt ?? when;
    return {
      event: new StatementPaidEvent(
        this.accountId,
        this.id,
        moneyToString(amount),
        fromAccountId,
        paymentTransactionId,
      ),
      carryOver: subtractMoney(periodAmount, amount),
    };
  }

  /**
   * Correct what was actually PAID on a settled period.
   *
   * The period's own total is untouched — that comes from its movements and is
   * only ever recomputed (`syncAmount`), never typed in. This moves the payment:
   * a figure entered wrong, or more money sent afterwards. The caller applies the
   * returned `paidDelta` to the payment movement, the source account's balance,
   * the credit pool and the shortfall carried into the next period — all of which
   * followed from the old figure and must follow the new one.
   *
   * Bounds are the same as a payment's: positive, and never more than the period
   * owes in total (`PaymentExceedsRemainingError`) — paying exactly the total makes
   * the period fully PAID again. `carryOver` is what the successor should now hold
   * (an absolute figure, not a delta: the caller knows what it holds today).
   */
  changePaidAmount(amount: string): { paidDelta: string; carryOver: string } {
    if (!this.props.paidAt) throw new StatementNotPaidError();
    const paying = toMoney(amount);
    if (paying.lessThanOrEqualTo(0)) throw new InvalidPaymentAmountError();
    if (paying.greaterThan(toMoney(this.props.amount))) throw new PaymentExceedsRemainingError();
    const paidDelta = subtractMoney(amount, this.props.paidAmount);
    this.props.paidAmount = moneyToString(amount);
    return { paidDelta, carryOver: subtractMoney(this.props.amount, amount) };
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
   *
   * A period settled with a SHORTFALL (one that carried its leftover forward) is
   * the third case: what was paid is a historical fact and must not be rewritten,
   * so the recomputation moves the CARRY-OVER instead — `carryOverDelta` is what
   * the successor period has to change by, and the payment movement and the credit
   * pool are both left alone (nothing extra was ever released).
   */
  syncAmount(recomputedAmount: string): {
    previousPaidAmount: string;
    paidDelta: string;
    carryOverDelta: string;
  } {
    const previousPaidAmount = this.paidAmount;
    const previousAmount = this.amount;
    this.props.amount = moneyToString(recomputedAmount);
    const zero = moneyToString("0");
    if (!this.props.paidAt) {
      return { previousPaidAmount, paidDelta: zero, carryOverDelta: zero };
    }
    if (this.props.carriedToId) {
      return {
        previousPaidAmount,
        paidDelta: zero,
        carryOverDelta: subtractMoney(recomputedAmount, previousAmount),
      };
    }
    this.props.paidAmount = moneyToString(recomputedAmount);
    return {
      previousPaidAmount,
      paidDelta: subtractMoney(this.props.paidAmount, previousPaidAmount),
      carryOverDelta: zero,
    };
  }
}

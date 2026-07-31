import { moneyToString } from "@finance/money";

import { StatementAlreadyPaidError, StatementNotPaidError } from "./errors";
import { StatementClosedEvent } from "./events/statement-closed.event";
import { StatementPaidEvent } from "./events/statement-paid.event";
import type { CreditStatementState } from "./states/credit-statement-state";
import { OpenState } from "./states/open-state";
import { PaidState } from "./states/paid-state";
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

  /** Derived from `closedAt`/`paidAt` — no stored `status` column. */
  get state(): CreditStatementState {
    if (this.props.paidAt) return new PaidState();
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

  /** Pay this statement: freezes `amount`, records the source account + payment
   * transaction, and (if still OPEN) closes it too. Rejects a double-pay
   * (`StatementAlreadyPaidError`) — the textbook State-pattern proof
   * (quickstart.md step 2). */
  pay(
    amount: string,
    fromAccountId: string,
    paymentTransactionId: string,
    now: Date,
  ): StatementPaidEvent {
    if (!this.state.canPay()) {
      throw new StatementAlreadyPaidError();
    }
    this.props.amount = amount;
    this.props.paidAt = now;
    this.props.paidFromAccountId = fromAccountId;
    this.props.paidTransactionId = paymentTransactionId;
    this.props.closedAt = this.props.closedAt ?? now;
    return new StatementPaidEvent(
      this.accountId,
      this.id,
      moneyToString(amount),
      fromAccountId,
      paymentTransactionId,
    );
  }

  /** Correct a PAID statement's frozen amount — rejected for OPEN/PENDING (edit
   * their linked transactions instead; the live sum updates itself). No
   * cascade to the linked payment transaction or to `creditUsed` (deliberate). */
  correctAmount(newAmount: string): void {
    if (!this.state.canCorrectAmount()) {
      throw new StatementNotPaidError();
    }
    this.props.amount = newAmount;
  }
}

import type { transactions } from "@finance/contracts";
import { moneyToString } from "@finance/money";

export interface TransactionProps {
  id: string;
  userId: string;
  type: transactions.TransactionType;
  amount: string;
  currency: string;
  occurredAt: Date;
  category: string | null;
  description: string | null;
  observation: string | null;
  emisor: string | null;
  receptor: string | null;
  lugar: string | null;
  bankAccountId: string | null;
  cardId: string | null;
  /** Issuer charge on the credit account itself (no card, feeds the pool). */
  financeCharge: boolean;
  installmentPlanId: string | null;
  creditStatementId: string | null;
  /** Non-null on the two rows of a transfer (see `TransferPolicy`). */
  transferGroupId: string | null;
  /** The `Debt` this movement pays — set only by `register-payment`/`settle`,
   * writing through `TransactionWriterRepositoryPort` directly (never through
   * this aggregate's own `planCreation`, same as `installmentPlanId`). */
  debtId: string | null;
  /** The `RecurringExpense` this movement was generated for — set only by
   * hand today (see `RecurringExpense`'s own doc comment; no automatic
   * generation mechanism exists yet). */
  recurringExpenseId: string | null;
  /** The `SavingsEntry` this movement IS — set only by
   * `TransactionWriterRepositoryPort` writes from `savings-entry`, never
   * through this aggregate's own `planCreation`. */
  savingsEntryId: string | null;
  /** The `SavingsGoal` this movement is the "retirar a cuenta" INCOME for —
   * set only by `savings-goal`'s close handler. */
  savingsGoalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TransactionPatch = Partial<{
  type: transactions.TransactionType;
  amount: string;
  currency: string;
  occurredAt: Date;
  category: string | null;
  description: string | null;
  observation: string | null;
  emisor: string | null;
  receptor: string | null;
  lugar: string | null;
  bankAccountId: string;
  cardId: string | null;
  financeCharge: boolean;
  creditStatementId: string | null;
}>;

/**
 * `Transaction` aggregate: a single income/expense movement. Card/account
 * compatibility rules and credit-pool contribution live in `MovementPolicy`
 * (a pure, separately-testable policy this aggregate's handlers consult) —
 * kept apart from this class because those rules need cross-aggregate
 * context (the account + card + card-limit state) that isn't this
 * aggregate's own data (FR-011: this domain never duplicates `accounts`'
 * own invariants, it only reads the context it needs).
 */
export class Transaction {
  private constructor(private props: TransactionProps) {}

  static fromPersistence(props: TransactionProps): Transaction {
    return new Transaction({ ...props });
  }

  /** Plans the row for a brand-new transaction — card is forced to `null`
   * for INCOME regardless of what was passed in (mirrors the pre-migration
   * service's `cardId: input.type === "INCOME" ? null : (input.cardId ?? null)`). */
  static planCreation(input: {
    userId: string;
    type: transactions.TransactionType;
    amount: string;
    currency: string;
    occurredAt: Date;
    category?: string | null;
    description?: string | null;
    observation?: string | null;
    emisor?: string | null;
    receptor?: string | null;
    lugar?: string | null;
    bankAccountId: string;
    cardId?: string | null;
    financeCharge?: boolean;
    creditStatementId: string | null;
  }): Omit<TransactionProps, "id" | "createdAt" | "updatedAt"> {
    return {
      userId: input.userId,
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      occurredAt: input.occurredAt,
      category: input.category ?? null,
      description: input.description ?? null,
      observation: input.observation ?? null,
      emisor: input.emisor ?? null,
      receptor: input.receptor ?? null,
      lugar: input.lugar ?? null,
      bankAccountId: input.bankAccountId,
      cardId: input.type === "INCOME" ? null : (input.cardId ?? null),
      financeCharge: input.financeCharge ?? false,
      installmentPlanId: null,
      creditStatementId: input.creditStatementId,
      // Ordinary movements are never part of a transfer — those are planned by
      // `Transfer.planPair` and written by the transfer commands.
      transferGroupId: null,
      debtId: null,
      recurringExpenseId: null,
      savingsEntryId: null,
      savingsGoalId: null,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get type(): transactions.TransactionType {
    return this.props.type;
  }
  get amount(): string {
    return moneyToString(this.props.amount);
  }
  get currency(): string {
    return this.props.currency;
  }
  get bankAccountId(): string | null {
    return this.props.bankAccountId;
  }
  get cardId(): string | null {
    return this.props.cardId;
  }
  get creditStatementId(): string | null {
    return this.props.creditStatementId;
  }
  get transferGroupId(): string | null {
    return this.props.transferGroupId;
  }
  get isTransferLeg(): boolean {
    return this.props.transferGroupId !== null;
  }

  /** Apply a partial patch — keeps `cardId` consistent with the *effective*
   * type (switching to INCOME always drops the card), same as the
   * pre-migration service. */
  applyUpdate(patch: TransactionPatch): void {
    const effectiveType = patch.type ?? this.props.type;
    if (patch.type !== undefined) this.props.type = patch.type;
    if (patch.amount !== undefined) this.props.amount = patch.amount;
    if (patch.currency !== undefined) this.props.currency = patch.currency;
    if (patch.occurredAt !== undefined) this.props.occurredAt = patch.occurredAt;
    if (patch.category !== undefined) this.props.category = patch.category;
    if (patch.description !== undefined) this.props.description = patch.description;
    if (patch.observation !== undefined) this.props.observation = patch.observation;
    if (patch.emisor !== undefined) this.props.emisor = patch.emisor;
    if (patch.receptor !== undefined) this.props.receptor = patch.receptor;
    if (patch.lugar !== undefined) this.props.lugar = patch.lugar;
    if (patch.bankAccountId !== undefined) this.props.bankAccountId = patch.bankAccountId;
    if (patch.cardId !== undefined || patch.type !== undefined) {
      this.props.cardId = effectiveType === "INCOME" ? null : (patch.cardId ?? this.props.cardId);
    }
    if (patch.creditStatementId !== undefined)
      this.props.creditStatementId = patch.creditStatementId;
  }

  snapshot(): Readonly<TransactionProps> {
    return this.props;
  }

  toContract(): transactions.Transaction {
    return {
      id: this.props.id,
      type: this.props.type,
      amount: moneyToString(this.props.amount),
      currency: this.props.currency,
      occurredAt: this.props.occurredAt.toISOString(),
      category: this.props.category,
      description: this.props.description,
      observation: this.props.observation,
      emisor: this.props.emisor,
      receptor: this.props.receptor,
      lugar: this.props.lugar,
      bankAccountId: this.props.bankAccountId,
      cardId: this.props.cardId,
      financeCharge: this.props.financeCharge,
      installmentPlanId: this.props.installmentPlanId,
      transferGroupId: this.props.transferGroupId,
      debtId: this.props.debtId,
      recurringExpenseId: this.props.recurringExpenseId,
      savingsEntryId: this.props.savingsEntryId,
      savingsGoalId: this.props.savingsGoalId,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}

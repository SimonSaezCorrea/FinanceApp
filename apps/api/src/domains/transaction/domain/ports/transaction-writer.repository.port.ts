export const TRANSACTION_WRITER_REPOSITORY = Symbol("TRANSACTION_WRITER_REPOSITORY");

/** A movement another domain needs to record as part of its own atomic action. */
export interface TransactionPlan {
  id: string;
  userId: string;
  bankAccountId: string | null;
  type: "INCOME" | "EXPENSE";
  /** moneyString */
  amount: string;
  currency: string;
  occurredAt: Date;
  categoryId: string | null;
  description: string | null;
  /** Free-text note on the movement (a statement payment carries its reference
   * here — the field the movement detail already shows). */
  observation?: string | null;
  /** Who paid / who got paid / where — the movement's free-text details, carried
   * over from an import's mapped columns. */
  emisor?: string | null;
  receptor?: string | null;
  lugar?: string | null;
  /** Issuer charge on a credit account itself: no card, feeds the credit pool. */
  financeCharge?: boolean;
  /** The card that made it — set by an import onto a credit card account, whose
   * expenses need one (the account's primary card). */
  cardId?: string | null;
  /** The OPEN billing period this movement contributes to, when it draws on a
   * credit pool — same link `CreateTransactionHandler` sets. */
  creditStatementId?: string | null;
  /** The installment plan this movement belongs to — set both on the finance charge
   * recorded when a plan with interest is created, and on the expense recorded when
   * one of its installments is paid, so either is recognisable among the movements. */
  installmentPlanId?: string | null;
  /** The `Debt` this movement pays — set by `register-payment`/`settle`. */
  debtId?: string | null;
  /** The `SavingsEntry` this movement IS — the real EXPENSE a contribution
   * generates on its source account (1:1). */
  savingsEntryId?: string | null;
  /** The `SavingsGoal` this movement is the "retirar a cuenta" INCOME for,
   * when a goal was closed with that destination. */
  savingsGoalId?: string | null;
  /** Spec 019: the OPEN `CreditStatement` this movement abonó early, set only
   * by `PrepayOpenPeriodHandler`. */
  prepaymentStatementId?: string | null;
  /** The CREDIT_CARD account `prepaymentStatementId` belongs to. */
  prepaymentAccountId?: string | null;
  /** Spec 028: the foreign-currency statement this INCOME settles — set only by
   * the statement pay/transfer commands. */
  settlesStatementId?: string | null;
}

/** One movement this app recorded on behalf of an instalment plan. */
export interface InstallmentPlanMovement {
  id: string;
  bankAccountId: string | null;
  type: "INCOME" | "EXPENSE";
  /** moneyString */
  amount: string;
  /** The interest charge recorded at creation, as opposed to an instalment expense. */
  financeCharge: boolean;
}

/** One movement removed together with an account (see `listForAccountDeletion`). */
export interface AccountDeletionMovement {
  id: string;
  bankAccountId: string | null;
  type: "INCOME" | "EXPENSE";
  /** moneyString */
  amount: string;
  currency: string;
  /** A leg of a transfer (its pair is removed with it). */
  transfer: boolean;
}

/**
 * Write port over the `transaction` table for the domains that must create
 * movements they don't own: `credit-statement` (paying a statement creates a real
 * EXPENSE inside its own Prisma transaction) and `import` (bulk insert). Keeps
 * both from touching `prisma.transaction` themselves — one table, one adapter.
 */
export interface TransactionWriterRepositoryPort {
  createWithTx(tx: unknown, plan: TransactionPlan): Promise<void>;
  /** Point every movement of a period's date window at that period, so the link
   * and the dates agree after a reconciliation. Same scoping rules as
   * `TransactionSumsRepositoryPort.netForPeriod`. */
  relinkToStatementWithTx(
    tx: unknown,
    input: {
      statementId: string;
      accountId: string;
      cardIds: string[] | null;
      from: Date;
      to: Date;
      /** Spec 028: same currency/settlement scoping as `netForPeriod`. */
      currency: string;
    },
  ): Promise<void>;
  /** Correct one movement's amount — used to keep a statement's payment movement
   * equal to what the period turned out to be worth. */
  updateAmountWithTx(tx: unknown, id: string, amount: string): Promise<void>;
  /** Remove a movement another domain created, inside that domain's own transaction.
   * Undoing an installment payment needs it: the expense and the balance are reversed
   * together or neither is. */
  deleteWithTx(tx: unknown, id: string): Promise<void>;
  /** Every movement recorded for a plan — its instalment expenses and its finance
   * charge. Deleting a plan reverses its whole history (FR-050a), and the impact is
   * declared to the user before it does (FR-050b). */
  listForInstallmentPlan(userId: string, planId: string): Promise<InstallmentPlanMovement[]>;
  /** Delete several of them at once, inside the caller's own transaction. */
  deleteManyWithTx(tx: unknown, ids: string[]): Promise<void>;
  /** Which account a movement came out of. Undoing an instalment payment restores
   * THAT account's balance, not the plan's currently remembered one — those can
   * differ, and crediting the wrong account is worse than crediting none. */
  accountIdForTransaction(userId: string, id: string): Promise<string | null>;
  /** Every movement that goes away when an account is deleted with its movements:
   * the account's own, the OTHER leg of each transfer it took part in, the
   * prepayments other accounts made into its billing periods, and `extraIds` —
   * movements another domain knows belong to it (its statements' payments, made
   * from other accounts). Rows outside the account carry their own account, whose
   * balance the caller restores. */
  listForAccountDeletion(
    userId: string,
    accountId: string,
    extraIds: string[],
  ): Promise<AccountDeletionMovement[]>;
  /** Bulk insert inside the caller's transaction, used by the `import` domain —
   * which applies the balance/credit-pool deltas itself, in that same
   * transaction, so an import is all-or-nothing. */
  createManyWithTx(
    tx: unknown,
    rows: (Omit<TransactionPlan, "id"> & { id?: string })[],
  ): Promise<number>;
}

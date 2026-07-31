/** Published when a CreditStatement is paid — a real EXPENSE transaction was
 * created on `paidFromAccountId` and the credit account's `creditUsed` was
 * decremented by `amount`. */
export class StatementPaidEvent {
  constructor(
    public readonly accountId: string,
    public readonly statementId: string,
    public readonly amount: string,
    public readonly paidFromAccountId: string,
    public readonly paidTransactionId: string,
  ) {}
}

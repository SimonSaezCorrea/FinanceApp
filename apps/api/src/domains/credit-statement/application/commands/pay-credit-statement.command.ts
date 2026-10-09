import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

export class PayCreditStatementCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly statementId: string,
    public readonly fromAccountId: string,
    public readonly idempotencyKey: string,
    /** Undefined = settle everything still owed for the period. */
    public readonly amount?: string,
    /** When the payment happened; defaults to now. Dates the created expense. */
    public readonly paidAt?: Date,
    /** Free-text note carried onto the payment movement. */
    public readonly reference?: string,
    /** Spec 030: what left the SOURCE account, in ITS currency — required when that
     * differs from the statement's (the two amounts are never compared). */
    public readonly chargedAmount?: string,
  ) {}
}

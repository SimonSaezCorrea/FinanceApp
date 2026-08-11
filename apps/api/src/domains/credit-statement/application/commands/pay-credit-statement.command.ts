import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class PayCreditStatementCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly statementId: string,
    public readonly fromAccountId: string,
    /** Undefined = settle everything still owed for the period. */
    public readonly amount?: string,
    /** When the payment happened; defaults to now. Dates the created expense. */
    public readonly paidAt?: Date,
    /** Free-text note carried onto the payment movement. */
    public readonly reference?: string,
  ) {}
}

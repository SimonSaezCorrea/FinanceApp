import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

/**
 * Spec 028 US3: the bank converted an overdue period in another currency and charged it to the
 * account's own currency. `amount` is that charge, in the ACCOUNT's currency.
 */
export class TransferStatementCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly statementId: string,
    public readonly amount: string,
    public readonly idempotencyKey: string,
    /** When the bank charged it; defaults to now. */
    public readonly transferredAt?: Date,
  ) {}
}

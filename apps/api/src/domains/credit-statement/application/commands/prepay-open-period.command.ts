import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

/**
 * Spec 019: abonar against the account's CURRENTLY OPEN period, without
 * closing it — the tarjeta equivalent of paying before the fecha de corte.
 * Unlike `PayCreditStatementCommand`, `amount` is REQUIRED: there is no "pay
 * everything" shorthand, since the period is still accumulating and
 * "everything" keeps changing.
 */
export class PrepayOpenPeriodCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly statementId: string,
    public readonly fromAccountId: string,
    public readonly amount: string,
    public readonly idempotencyKey: string,
    /** When the abono happened; defaults to now. Dates the created expense. */
    public readonly paidAt?: Date,
    /** Free-text note carried onto the created movement. */
    public readonly reference?: string,
  ) {}
}

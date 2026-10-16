import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

/** "Deshacer pago": undoes a statement's payment while the period that received its shortfall
 * (if any) isn't settled. */
export class UndoStatementPaymentCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly statementId: string,
    public readonly idempotencyKey: string,
  ) {}
}

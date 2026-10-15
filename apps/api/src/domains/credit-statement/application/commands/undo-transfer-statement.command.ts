import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

/** Spec 028 US3: undoes a transfer while the period that received the charge isn't settled. */
export class UndoTransferStatementCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly statementId: string,
    public readonly idempotencyKey: string,
  ) {}
}

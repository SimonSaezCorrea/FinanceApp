import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class CorrectStatementAmountCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly statementId: string,
    public readonly amount: string,
  ) {}
}

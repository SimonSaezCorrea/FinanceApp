import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** "Generar facturación": close the account's open period(s) with the dates the
 * user read off the bank's statement. */
export class GenerateStatementsCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly periodStart: Date,
    public readonly closedAt: Date,
    public readonly dueDate: Date,
  ) {}
}

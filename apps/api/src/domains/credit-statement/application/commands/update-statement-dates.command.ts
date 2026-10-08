import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** Correct a generated statement's start, close and payment due date. */
export class UpdateStatementDatesCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly statementId: string,
    public readonly periodStart: Date,
    public readonly closedAt: Date,
    public readonly dueDate: Date,
  ) {}
}

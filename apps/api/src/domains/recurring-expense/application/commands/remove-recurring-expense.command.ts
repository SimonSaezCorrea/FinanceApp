import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class RemoveRecurringExpenseCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly id: string,
  ) {}
}

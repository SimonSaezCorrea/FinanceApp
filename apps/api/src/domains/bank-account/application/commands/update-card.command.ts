import type { accounts } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class UpdateCardCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly cardId: string,
    public readonly input: accounts.CreateCard,
  ) {}
}

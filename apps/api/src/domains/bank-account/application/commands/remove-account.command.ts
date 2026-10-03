import type { accounts } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class RemoveAccountCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    /** What related data goes with the account; omitted = the account alone. */
    public readonly options: accounts.RemoveAccount = {
      movements: false,
      installmentPlans: false,
      recurring: false,
      savingsEntries: false,
    },
  ) {}
}

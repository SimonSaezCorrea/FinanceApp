import type { accounts } from "@finance/contracts";

import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

export class ListAccountsQuery implements UserScopedQuery {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly filters: accounts.AccountFilters,
  ) {}
}

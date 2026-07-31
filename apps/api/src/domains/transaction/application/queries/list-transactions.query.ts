import type { transactions } from "@finance/contracts";

import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

export class ListTransactionsQuery implements UserScopedQuery {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly filters: transactions.TransactionFilters,
  ) {}
}

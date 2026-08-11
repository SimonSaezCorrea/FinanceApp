import type { transactions } from "@finance/contracts";

import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

/** Aggregates for the same filtered set `ListTransactionsQuery` pages through. */
export class SummarizeTransactionsQuery implements UserScopedQuery {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly filters: transactions.TransactionFilters,
  ) {}
}

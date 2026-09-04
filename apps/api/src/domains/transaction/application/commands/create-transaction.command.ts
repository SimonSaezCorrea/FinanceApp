import type { transactions } from "@finance/contracts";

import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

export class CreateTransactionCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: transactions.CreateTransaction,
    public readonly idempotencyKey: string,
  ) {}
}

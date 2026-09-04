import type { transactions } from "@finance/contracts";

import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

export class CreateTransferCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: transactions.CreateTransfer,
    public readonly idempotencyKey: string,
  ) {}
}

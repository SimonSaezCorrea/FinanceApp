import type { savings } from "@finance/contracts";

import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

export class CreateSavingsEntryCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: savings.CreateSavingsEntry,
    public readonly idempotencyKey: string,
  ) {}
}

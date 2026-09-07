import type { savings } from "@finance/contracts";

import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

export class UpdateSavingsEntryCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly id: string,
    public readonly input: savings.UpdateSavingsEntry,
    public readonly idempotencyKey: string,
  ) {}
}

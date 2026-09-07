import type { savings } from "@finance/contracts";

import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

export class CloseSavingsGoalCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly id: string,
    public readonly idempotencyKey: string,
    public readonly input: savings.CloseSavingsGoal,
  ) {}
}

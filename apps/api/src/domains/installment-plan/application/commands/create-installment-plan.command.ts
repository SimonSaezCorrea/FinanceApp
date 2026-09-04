import type { installments } from "@finance/contracts";

import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

export class CreateInstallmentPlanCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: installments.CreateInstallmentPlan,
    public readonly idempotencyKey: string,
  ) {}
}

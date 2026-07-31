import type { installments } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class CreateInstallmentPlanCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: installments.CreateInstallmentPlan,
  ) {}
}

import type { transactions } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class UpdateTransferCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly transferGroupId: string,
    public readonly input: transactions.UpdateTransfer,
  ) {}
}

import type { transactions } from "@finance/contracts";

import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

/** "Transferir pendientes" (specs/036): one transfer for the sum of the chosen
 * movements, which then take a value in a yes/no field. */
export class CoverWithTransferCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: transactions.CoverTransfer,
    public readonly idempotencyKey: string,
  ) {}
}

import type { imports } from "@finance/contracts";

import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

export class ImportTransactionsCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: imports.ImportTransactionsRequest,
    public readonly idempotencyKey: string,
  ) {}
}

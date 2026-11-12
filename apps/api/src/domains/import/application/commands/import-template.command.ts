import type { imports } from "@finance/contracts";

import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

export class ImportTemplateCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: imports.TemplateImportRequest,
    public readonly idempotencyKey: string,
    /** The caller's session: REPLACE needs a recent step-up of it (security run-3). */
    public readonly sessionId: string,
  ) {}
}

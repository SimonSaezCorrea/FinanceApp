import type { imports } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** Validates a template without writing anything (specs/027, research R9). */
export class PreviewTemplateQuery implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: imports.TemplateImportRequest,
  ) {}
}

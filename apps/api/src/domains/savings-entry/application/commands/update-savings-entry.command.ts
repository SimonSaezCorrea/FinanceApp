import type { savings } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class UpdateSavingsEntryCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly id: string,
    public readonly input: savings.UpdateSavingsEntry,
  ) {}
}

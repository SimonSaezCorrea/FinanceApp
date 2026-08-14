import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class RemoveTransferCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly transferGroupId: string,
  ) {}
}

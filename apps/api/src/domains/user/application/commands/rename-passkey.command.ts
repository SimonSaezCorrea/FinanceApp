import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class RenamePasskeyCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly passkeyId: string,
    public readonly name: string,
  ) {}
}

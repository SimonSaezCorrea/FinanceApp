import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class CloseSessionCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly sessionId: string,
  ) {}
}

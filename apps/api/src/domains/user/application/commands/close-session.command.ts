import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class CloseSessionCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly sessionId: string,
    /** The caller's own `sid` — closing any OTHER session needs its recent step-up. */
    public readonly currentSessionId: string,
  ) {}
}

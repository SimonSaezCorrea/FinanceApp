import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class RegenerateRecoveryCodesCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    /** The session making the request: its step-up is what authorizes (and is spent by) this. */
    public readonly sessionId: string,
  ) {}
}

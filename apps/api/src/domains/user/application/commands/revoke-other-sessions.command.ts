import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class RevokeOtherSessionsCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    /** The `sid` of the access token making this request — the one session that MUST
     * survive, so the caller never autoexpels itself (FR-006). */
    public readonly currentSessionId: string,
  ) {}
}

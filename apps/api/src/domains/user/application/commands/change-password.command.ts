import type { auth } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class ChangePasswordCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: auth.ChangePasswordRequest,
    /** The `sid` of the session that made this request (specs/024) — kept open while
     * every other session of this user is closed. Same origin as
     * `RevokeOtherSessionsCommand.currentSessionId` (`AuthUser.sessionId`). */
    public readonly currentSessionId: string,
  ) {}
}

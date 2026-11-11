import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** `DELETE /auth/me/passkeys/:id`. `sessionId` is the caller's session: it must have stepped up
 * recently (removing a factor lowers what a step-up asks for, run-2) and it stays open while the
 * other sessions opened with that passkey are closed. */
export class RemovePasskeyCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly passkeyId: string,
    public readonly sessionId: string,
  ) {}
}

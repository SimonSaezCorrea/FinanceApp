import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** Step-up by passkey, step 2: the browser's WebAuthn response against the sealed challenge. */
export class VerifyStepUpPasskeyCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly sessionId: string,
    public readonly response: unknown,
    public readonly expectedChallenge: string,
    /** The user id sealed into the challenge cookie at step 1 — must be the caller. */
    public readonly challengeUserId: string | null,
  ) {}
}

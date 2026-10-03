import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** Step-up by passkey, step 1: the WebAuthn request options for the caller's own passkeys. */
export class StartStepUpPasskeyCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(public readonly userId: string) {}
}

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** `POST /auth/email/verification` (specs/032): sends the confirmation link again — to the
 * pending address if there is one, else to the primary while it is unconfirmed. */
export class ResendVerificationCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(public readonly userId: string) {}
}

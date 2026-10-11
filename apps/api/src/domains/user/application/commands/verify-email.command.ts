import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/** `POST /auth/email/verify` (specs/032): no session — the link's token alone identifies the
 * account and the address, so it works opened on any device or with another account signed in. */
export class VerifyEmailCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly token: string) {}
}

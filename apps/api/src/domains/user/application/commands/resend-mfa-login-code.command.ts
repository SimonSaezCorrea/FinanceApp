import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/** "Reenviar código" during a pending login (specs/040). `userId` comes from the verified
 * `mfa_pending_token`, never from the body. */
export class ResendMfaLoginCodeCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly userId: string) {}
}

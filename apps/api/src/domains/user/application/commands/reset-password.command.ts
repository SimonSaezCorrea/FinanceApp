import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/** `POST /auth/password/reset` (specs/032 US2): no session; the link's token names the account. */
export class ResetPasswordCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(
    public readonly token: string,
    public readonly newPassword: string,
  ) {}
}

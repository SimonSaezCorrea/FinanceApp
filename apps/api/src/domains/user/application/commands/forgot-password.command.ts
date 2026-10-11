import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/** `POST /auth/password/forgot` (specs/032 US2): no session; the RUT names the account. */
export class ForgotPasswordCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly identifierValue: string) {}
}

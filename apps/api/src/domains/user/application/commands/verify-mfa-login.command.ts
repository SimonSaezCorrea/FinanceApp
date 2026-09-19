import type { auth } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** `userId` here comes from a server-issued, server-verified `mfa_pending_token` — never a
 * client-supplied id (Constitution Principle II: an ownership check the client can't spoof). */
export class VerifyMfaLoginCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: auth.VerifyMfaLoginRequest,
  ) {}
}

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class StartPasskeyRegistrationCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    /** The caller's session: adding a passkey needs its recent step-up (GHSA-jhp2-jfjr-fqfq). */
    public readonly sessionId?: string,
  ) {}
}

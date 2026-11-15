import type { auth } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class ConfirmMfaEnrollmentCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: auth.ConfirmMfaEnrollmentRequest,
    /** The caller's session: only the one that started the setup may confirm it (run-4). */
    public readonly sessionId?: string,
  ) {}
}

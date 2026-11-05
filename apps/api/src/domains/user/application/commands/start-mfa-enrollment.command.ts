import type { auth } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class StartMfaEnrollmentCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    /** Which method to set up (specs/040); absent = the app. */
    public readonly input: auth.StartMfaEnrollmentRequest = {},
    /** The caller's session: a METHOD CHANGE needs its recent step-up. */
    public readonly sessionId?: string,
  ) {}
}

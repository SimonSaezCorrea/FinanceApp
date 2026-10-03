import type { auth } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** Step-up by TOTP code or password, stamped on `sessionId` (the caller's own `sid`). */
export class VerifyStepUpCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly sessionId: string,
    public readonly input: auth.StepUpRequest,
  ) {}
}

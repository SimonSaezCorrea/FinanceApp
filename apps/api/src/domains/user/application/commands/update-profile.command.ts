import type { auth } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** `PATCH /auth/me`. `sessionId` is the caller's session: changing the RUT (the login identifier)
 * needs a recent step-up of it (run-2). */
export class UpdateProfileCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: auth.UpdateProfileRequest,
    public readonly sessionId: string,
  ) {}
}

import type { auth } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class DeleteAccountCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly input: auth.DeleteAccountRequest,
    /** The `sid` of the session asking (security run-3): with a second factor or a passkey it
     * must have stepped up recently. */
    public readonly currentSessionId: string,
  ) {}
}

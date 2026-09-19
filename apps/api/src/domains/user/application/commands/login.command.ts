import type { auth } from "@finance/contracts";

import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";
import type { DeviceContext } from "../session-issuer";

export class LoginCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(
    public readonly input: auth.LoginRequest,
    /** User-Agent/IP of the request — only used when this login actually establishes a
     * session (not when it only reaches the MFA-pending step). */
    public readonly device?: DeviceContext,
  ) {}
}

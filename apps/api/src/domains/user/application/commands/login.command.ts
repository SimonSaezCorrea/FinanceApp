import type { auth } from "@finance/contracts";

import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

export class LoginCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly input: auth.LoginRequest) {}
}

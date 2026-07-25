import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

export class UnpayInstallmentCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly planId: string,
    public readonly sequence: number,
  ) {}
}

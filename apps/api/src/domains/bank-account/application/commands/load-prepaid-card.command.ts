import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** Load ("recargar") a PREPAID card from the account it belongs to. */
export class LoadPrepaidCardCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly cardId: string,
    public readonly amount: string,
    /** Dates the created expense; defaults to now. */
    public readonly occurredAt?: Date,
  ) {}
}

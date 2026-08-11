import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** Reconcile one billing period against the movements that fall inside it. */
export class SyncStatementCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly statementId: string,
  ) {}
}

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** Correct what was actually paid on an already-settled period. The period's own
 * total is not part of this — only the payment. */
export class UpdateStatementPaymentCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly statementId: string,
    public readonly amount: string,
  ) {}
}

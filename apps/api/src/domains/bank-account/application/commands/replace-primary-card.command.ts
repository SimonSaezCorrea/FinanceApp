import type { accounts } from "@finance/contracts";

import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

/** `POST /accounts/:id/cards/:cardId/replace-primary` (spec 039): deactivate or delete the
 * primary card `cardId`, naming the card that takes its place. */
export class ReplacePrimaryCardCommand implements IdempotentCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly cardId: string,
    public readonly input: accounts.ReplacePrimaryCard,
    public readonly idempotencyKey: string,
  ) {}
}

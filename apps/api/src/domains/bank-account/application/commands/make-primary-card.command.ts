import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** `POST /accounts/:id/cards/:cardId/make-primary` (spec 039). */
export class MakePrimaryCardCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly accountId: string,
    public readonly cardId: string,
  ) {}
}

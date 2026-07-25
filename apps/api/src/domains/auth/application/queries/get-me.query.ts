import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

export class GetMeQuery implements UserScopedQuery {
  readonly scope = "user" as const;

  constructor(public readonly userId: string) {}
}

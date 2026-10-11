import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

/** `GET /auth/me/emails` (specs/032). */
export class ListUserEmailsQuery implements UserScopedQuery {
  readonly scope = "user" as const;

  constructor(public readonly userId: string) {}
}

import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

export class ListSessionsQuery implements UserScopedQuery {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    /** The `sid` of the access token making this request — which row to mark
     * `isCurrent` (never stored on the row itself, data-model.md). */
    public readonly currentSessionId: string,
  ) {}
}

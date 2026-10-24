import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

/** Per value of one custom field, how many movements hold it and their totals
 * (specs/036, FR-016c) — the summary the "Campos" section shows. */
export class SummarizeByFieldQuery implements UserScopedQuery {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly fieldId: string,
  ) {}
}

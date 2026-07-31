import type { SystemCommand as SystemQuery } from "../../../../infra/cqrs/base-command.handler";

/** Global reference data — no `userId` to scope by (deliberate exception,
 * see `reference.module.ts`), so this is a `SystemQuery` like
 * `GenerateAllDueStatementsCommand`, not a `UserScopedQuery`. */
export class ListCountriesQuery implements SystemQuery {
  readonly scope = "system" as const;
}

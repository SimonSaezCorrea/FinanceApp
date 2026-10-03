import type { SystemCommand as SystemQuery } from "../../../../infra/cqrs/base-command.handler";

/** Global reference data — no `userId` to scope by. */
export class ListCategoriesQuery implements SystemQuery {
  readonly scope = "system" as const;
}

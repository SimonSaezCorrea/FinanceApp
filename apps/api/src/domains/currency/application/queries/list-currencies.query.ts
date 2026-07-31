import type { SystemCommand as SystemQuery } from "../../../../infra/cqrs/base-command.handler";

/** Global reference data — no `userId` to scope by (see `reference.module.ts`). */
export class ListCurrenciesQuery implements SystemQuery {
  readonly scope = "system" as const;
}

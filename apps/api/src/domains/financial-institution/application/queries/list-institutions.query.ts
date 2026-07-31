import type { reference } from "@finance/contracts";

import type { SystemCommand as SystemQuery } from "../../../../infra/cqrs/base-command.handler";

/** Global reference data — no `userId` to scope by (see `reference.module.ts`). */
export class ListInstitutionsQuery implements SystemQuery {
  readonly scope = "system" as const;

  constructor(public readonly filters: reference.InstitutionFilters) {}
}

import type { exchangeRates } from "@finance/contracts";

import type { SystemCommand as SystemQuery } from "../../../../infra/cqrs/base-command.handler";

/** Global reference data — no `userId` to scope by (the same documented exception as
 * `ListCountriesQuery`), so this is a `SystemQuery`, not a `UserScopedQuery`. */
export class ListExchangeRatesQuery implements SystemQuery {
  readonly scope = "system" as const;

  constructor(
    public readonly filters: exchangeRates.ListExchangeRatesQuery,
    /** Chile's calendar day today (`YYYY-MM-DD`) — what an omitted bound defaults against. */
    public readonly today: string,
  ) {}
}

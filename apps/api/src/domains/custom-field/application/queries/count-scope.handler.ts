import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { customFields } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  TRANSACTION_SCOPE_LOOKUP,
  type TransactionScopeLookupPort,
} from "../../../transaction/domain/ports/transaction-scope-lookup.port";
import { scopeFromInput } from "../../domain/custom-field.aggregate";
import { scopeFilter } from "../scope";
import { CountScopeQuery } from "./custom-field.queries";

/** How many existing movements a scope covers — the "N" of "aplicar el valor por
 * defecto a los N movimientos existentes" (FR-005). Reads only. */
@Injectable()
@QueryHandler(CountScopeQuery)
export class CountScopeQueryHandler extends BaseQueryHandler<CountScopeQuery, { count: number }> {
  constructor(
    @Inject(TRANSACTION_SCOPE_LOOKUP) private readonly movements: TransactionScopeLookupPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(): Promise<void> {}

  protected async handle(query: CountScopeQuery): Promise<{ count: number }> {
    const where = await scopeFilter(
      this.cards,
      query.userId,
      scopeFromInput(query.fieldScope as customFields.CustomFieldScope),
    );
    return { count: await this.movements.countInScope(query.userId, where) };
  }
}

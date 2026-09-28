import { Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { AccountNotFoundError } from "../../domain/errors";
import { deletionImpactDto, type AccountDeletionScope } from "../account-deletion";
import { AccountDeletionScopeLoader } from "../account-deletion.loader";
import { GetAccountDeletionImpactQuery } from "./get-account-deletion-impact.query";

/** What deleting an account could take with it — counted before the user chooses. */
@Injectable()
@QueryHandler(GetAccountDeletionImpactQuery)
export class GetAccountDeletionImpactQueryHandler extends BaseQueryHandler<
  GetAccountDeletionImpactQuery,
  accounts.AccountDeletionImpact,
  AccountDeletionScope
> {
  constructor(private readonly scopes: AccountDeletionScopeLoader) {
    super();
  }

  protected async loadContext(query: GetAccountDeletionImpactQuery): Promise<AccountDeletionScope> {
    const scope = await this.scopes.load(query.userId, query.accountId);
    if (!scope) throw new AccountNotFoundError();
    return scope;
  }

  protected async handle(
    _query: GetAccountDeletionImpactQuery,
    scope: AccountDeletionScope,
  ): Promise<accounts.AccountDeletionImpact> {
    return deletionImpactDto(scope);
  }
}

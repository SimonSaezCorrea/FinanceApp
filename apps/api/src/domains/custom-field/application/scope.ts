import type { customFields } from "@finance/contracts";

import type { BankAccountLookupPort } from "../../bank-account/domain/ports/bank-account-lookup.port";
import type { CardAccountRepositoryPort } from "../../card-account/domain/ports/card-account.repository.port";
import type { MovementFacts } from "../../transaction/domain/ports/transaction-scope-lookup.port";
import { scopeWhere, type ScopeWhere } from "../../transaction/domain/scope-where";
import type { CustomFieldScopeProps } from "../domain/custom-field.aggregate";
import { CustomFieldAccountNotFoundError } from "../domain/errors";

/** Every account a scope names must be the person's own, before it is persisted
 * (Constitution Principle II). */
export async function assertScopeAccountsOwned(
  accounts: BankAccountLookupPort,
  userId: string,
  scope: customFields.CustomFieldScope | undefined,
): Promise<void> {
  for (const accountId of scope?.accountIds ?? []) {
    if (!(await accounts.accountOwned(userId, accountId)))
      throw new CustomFieldAccountNotFoundError();
  }
}

/** A scope as a movement filter, its card kinds turned into the person's cards. */
export async function scopeFilter(
  cards: CardAccountRepositoryPort,
  userId: string,
  scope: CustomFieldScopeProps,
): Promise<ScopeWhere> {
  return scopeWhere(scope, await cards.kindsForUser(userId));
}

/** The shape a scope looks at, from a movement's facts and the person's cards. */
export function shapeOf(
  facts: MovementFacts,
  cardKinds: ReadonlyMap<string, customFields.CustomFieldCardKind>,
): customFields.MovementShape {
  return {
    kind: facts.transferGroupId ? "TRANSFER" : facts.type,
    bankAccountId: facts.bankAccountId,
    cardKind: facts.cardId ? (cardKinds.get(facts.cardId) ?? null) : null,
  };
}

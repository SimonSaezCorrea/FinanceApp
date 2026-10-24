import type { customFields } from "@finance/contracts";

/**
 * A custom field's scope (specs/036) as a filter over movements: what the scope
 * says, with its card kinds already turned into the ids of the person's cards of
 * those kinds. `null` = no restriction in that dimension; an empty list = nothing.
 */
export interface ScopeWhere {
  kinds: customFields.CustomFieldMovementKind[];
  accountIds: string[] | null;
  cardIds: string[] | null;
}

export function scopeWhere(
  scope: customFields.CustomFieldScopeRule,
  cardKinds: ReadonlyMap<string, customFields.CustomFieldCardKind>,
): ScopeWhere {
  return {
    kinds: [...scope.movementKinds],
    accountIds: scope.restrictAccounts ? [...scope.accountIds] : null,
    cardIds:
      scope.cardKinds.length > 0
        ? [...cardKinds].filter(([, kind]) => scope.cardKinds.includes(kind)).map(([id]) => id)
        : null,
  };
}

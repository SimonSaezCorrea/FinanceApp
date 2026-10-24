import type { customFields } from "@finance/contracts";

import type { UserScopedCommand as UserScopedQuery } from "../../../../infra/cqrs/base-command.handler";

/** Queries of the `custom-field` domain (specs/036), one class per read. */

export class ListCustomFieldsQuery implements UserScopedQuery {
  readonly scope = "user" as const;
  constructor(public readonly userId: string) {}
}

/** How many existing movements a scope covers (FR-005, "aplicar a N existentes"). */
export class CountScopeQuery implements UserScopedQuery {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly fieldScope: customFields.CustomFieldScope,
  ) {}
}

/** What a bulk assignment would do, before confirming it (FR-016a). */
export class PreviewAssignmentQuery implements UserScopedQuery {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly fieldId: string,
    public readonly body: customFields.AssignValuesRequest,
  ) {}
}

import type { customFields } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";
import type { IdempotentCommand } from "../../../../infra/cqrs/base-idempotent-command.handler";

/** Commands of the `custom-field` domain (specs/036), one class per mutation. */

export class CreateCustomFieldCommand implements UserScopedCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly input: customFields.CreateCustomField,
  ) {}
}

export class UpdateCustomFieldCommand implements UserScopedCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly id: string,
    public readonly patch: customFields.UpdateCustomField,
  ) {}
}

export class RemoveCustomFieldCommand implements UserScopedCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly id: string,
  ) {}
}

/** `PATCH /transactions/:id/custom-fields`. */
export class SetTransactionValuesCommand implements UserScopedCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly values: Record<string, customFields.CustomFieldValue | null>,
  ) {}
}

/** A bulk assignment — retry-safe with the client's `Idempotency-Key` (form (c)). */
export class AssignValuesCommand implements IdempotentCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly idempotencyKey: string,
    public readonly fieldId: string,
    public readonly body: customFields.AssignValuesRequest,
  ) {}
}

/** "Deshacer" of a bulk assignment (compare-and-set, form (a)). */
export class RevertAssignmentCommand implements UserScopedCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly fieldId: string,
    public readonly body: customFields.RevertAssignmentRequest,
  ) {}
}

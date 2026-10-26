import type { movementTemplates } from "@finance/contracts";

import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** Commands of the `movement-template` domain (specs/037), one class per mutation. */

export class CreateMovementTemplateCommand implements UserScopedCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly input: movementTemplates.SaveMovementTemplate,
  ) {}
}

/** `PUT /movement-templates/:id` — the whole state is replaced. */
export class ReplaceMovementTemplateCommand implements UserScopedCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly id: string,
    public readonly input: movementTemplates.SaveMovementTemplate,
  ) {}
}

export class RemoveMovementTemplateCommand implements UserScopedCommand {
  readonly scope = "user" as const;
  constructor(
    public readonly userId: string,
    public readonly id: string,
  ) {}
}

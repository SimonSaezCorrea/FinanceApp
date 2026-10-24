import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { CustomFieldNotFoundError } from "../../domain/errors";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../domain/ports/custom-field.repository.port";
import { RemoveCustomFieldCommand } from "./custom-field.commands";

/**
 * Deletes a field and, by cascade, every value it had (FR-006) — the movements
 * themselves are untouched. Retry safety (Principle VII, form (a)): deleting is
 * terminal; a replay finds nothing and answers `CUSTOM_FIELD_NOT_FOUND`.
 */
@Injectable()
@CommandHandler(RemoveCustomFieldCommand)
export class RemoveCustomFieldHandler extends BaseCommandHandler<RemoveCustomFieldCommand, void> {
  constructor(
    eventBus: EventBus,
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<void> {}

  protected async handle(command: RemoveCustomFieldCommand): Promise<HandleResult<void>> {
    const removed = await this.fields.remove(command.userId, command.id);
    if (!removed) throw new CustomFieldNotFoundError();
    return { result: undefined, events: [] };
  }
}

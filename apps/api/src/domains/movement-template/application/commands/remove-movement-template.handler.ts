import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { MovementTemplateNotFoundError } from "../../domain/errors";
import {
  MOVEMENT_TEMPLATE_REPOSITORY,
  type MovementTemplateRepositoryPort,
} from "../../domain/ports/movement-template.repository.port";
import { RemoveMovementTemplateCommand } from "./movement-template.commands";

/**
 * Deletes a template — no movement changes (FR-005). Retry safety (Principle VII,
 * form (a)): deleting is terminal; a replay finds nothing and answers
 * `MOVEMENT_TEMPLATE_NOT_FOUND`.
 */
@Injectable()
@CommandHandler(RemoveMovementTemplateCommand)
export class RemoveMovementTemplateHandler extends BaseCommandHandler<
  RemoveMovementTemplateCommand,
  void
> {
  constructor(
    eventBus: EventBus,
    @Inject(MOVEMENT_TEMPLATE_REPOSITORY)
    private readonly templates: MovementTemplateRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<void> {}

  protected async handle(command: RemoveMovementTemplateCommand): Promise<HandleResult<void>> {
    const removed = await this.templates.remove(command.userId, command.id);
    if (!removed) throw new MovementTemplateNotFoundError();
    return { result: undefined, events: [] };
  }
}

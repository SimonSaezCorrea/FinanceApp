import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { movementTemplates } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  MovementTemplate,
  type PlannedMovementTemplate,
} from "../../domain/movement-template.aggregate";
import { MovementTemplateLimitReachedError } from "../../domain/errors";
import {
  MOVEMENT_TEMPLATE_REPOSITORY,
  type MovementTemplateRepositoryPort,
} from "../../domain/ports/movement-template.repository.port";
import { TemplateReferencePortsProvider } from "../reference-ports.provider";
import { verifyTemplateReferences } from "../template-references";
import { CreateMovementTemplateCommand } from "./movement-template.commands";

interface Context {
  plan: PlannedMovementTemplate;
}

/**
 * Creates a template (FR-001), at most `MOVEMENT_TEMPLATE_MAX` per person (FR-003),
 * every reference verified first (FR-009). Retry safety (Principle VII, form (b)): the
 * unique `(userId, nameKey)` makes a replay answer `MOVEMENT_TEMPLATE_NAME_TAKEN`
 * instead of creating a second template. Two concurrent creates at 49 may leave 51 —
 * accepted (no money involved), same as custom fields.
 */
@Injectable()
@CommandHandler(CreateMovementTemplateCommand)
export class CreateMovementTemplateHandler extends BaseCommandHandler<
  CreateMovementTemplateCommand,
  movementTemplates.MovementTemplate,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(MOVEMENT_TEMPLATE_REPOSITORY)
    private readonly templates: MovementTemplateRepositoryPort,
    private readonly refs: TemplateReferencePortsProvider,
  ) {
    super(eventBus);
  }

  protected async loadContext({ userId, input }: CreateMovementTemplateCommand): Promise<Context> {
    if ((await this.templates.countForUser(userId)) >= movementTemplates.MOVEMENT_TEMPLATE_MAX)
      throw new MovementTemplateLimitReachedError();
    const values = await verifyTemplateReferences(this.refs, userId, input);
    return { plan: MovementTemplate.planCreation(userId, input, values) };
  }

  protected async handle(
    _command: CreateMovementTemplateCommand,
    { plan }: Context,
  ): Promise<HandleResult<movementTemplates.MovementTemplate>> {
    const created = await this.templates.create(plan);
    return {
      result: created.toContract(new Set(Object.keys(plan.customFieldValues))),
      events: [],
    };
  }
}

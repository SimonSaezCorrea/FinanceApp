import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { movementTemplates } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import type {
  MovementTemplate,
  TemplateFieldValue,
} from "../../domain/movement-template.aggregate";
import { MovementTemplateNotFoundError } from "../../domain/errors";
import {
  MOVEMENT_TEMPLATE_REPOSITORY,
  type MovementTemplateRepositoryPort,
} from "../../domain/ports/movement-template.repository.port";
import { TemplateReferencePortsProvider } from "../reference-ports.provider";
import { verifyTemplateReferences } from "../template-references";
import { ReplaceMovementTemplateCommand } from "./movement-template.commands";

interface Context {
  template: MovementTemplate;
  values: Record<string, TemplateFieldValue>;
}

/**
 * Replaces a template's whole state (FR-004). Movements created from it never change
 * (FR-005). Retry safety (Principle VII, form (b)): it writes an absolute state on its
 * own row — repeating it changes nothing.
 */
@Injectable()
@CommandHandler(ReplaceMovementTemplateCommand)
export class ReplaceMovementTemplateHandler extends BaseCommandHandler<
  ReplaceMovementTemplateCommand,
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

  protected async loadContext({
    userId,
    id,
    input,
  }: ReplaceMovementTemplateCommand): Promise<Context> {
    const template = await this.templates.findOwned(userId, id);
    if (!template) throw new MovementTemplateNotFoundError();
    const values = await verifyTemplateReferences(this.refs, userId, input);
    return { template, values };
  }

  protected async handle(
    command: ReplaceMovementTemplateCommand,
    { template, values }: Context,
  ): Promise<HandleResult<movementTemplates.MovementTemplate>> {
    template.replace(command.input, values);
    await this.templates.save(template);
    return { result: template.toContract(new Set(Object.keys(values))), events: [] };
  }
}

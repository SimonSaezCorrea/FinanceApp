import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { movementTemplates } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../../custom-field/domain/ports/custom-field.repository.port";
import {
  MOVEMENT_TEMPLATE_REPOSITORY,
  type MovementTemplateRepositoryPort,
} from "../../domain/ports/movement-template.repository.port";
import { ListMovementTemplatesQuery } from "./movement-template.queries";

/** The person's templates, by name. A value for a custom field deleted since is left
 * out (the template degrades instead of carrying a dangling id, FR-011). */
@Injectable()
@QueryHandler(ListMovementTemplatesQuery)
export class ListMovementTemplatesQueryHandler extends BaseQueryHandler<
  ListMovementTemplatesQuery,
  movementTemplates.MovementTemplate[]
> {
  constructor(
    @Inject(MOVEMENT_TEMPLATE_REPOSITORY)
    private readonly templates: MovementTemplateRepositoryPort,
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(): Promise<void> {}

  protected async handle(
    query: ListMovementTemplatesQuery,
  ): Promise<movementTemplates.MovementTemplate[]> {
    const [templates, fields] = await Promise.all([
      this.templates.listForUser(query.userId),
      this.fields.listForUser(query.userId),
    ]);
    const fieldIds = new Set(fields.map((f) => f.id));
    return templates.map((t) => t.toContract(fieldIds));
  }
}

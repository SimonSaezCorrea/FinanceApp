import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { customFields } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import {
  TRANSACTION_SCOPE_LOOKUP,
  type TransactionScopeLookupPort,
} from "../../../transaction/domain/ports/transaction-scope-lookup.port";
import { CustomFieldNotFoundError } from "../../domain/errors";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../domain/ports/custom-field.repository.port";
import { planAssignment } from "../assignment";
import { PreviewAssignmentQuery } from "./custom-field.queries";

/** What a bulk assignment would do, without doing it: how many movements get the
 * value, how many are left out, and how many hold a different one today — what the
 * confirmation above 20 movements says (FR-016a). */
@Injectable()
@QueryHandler(PreviewAssignmentQuery)
export class PreviewAssignmentQueryHandler extends BaseQueryHandler<
  PreviewAssignmentQuery,
  customFields.AssignmentPreview
> {
  constructor(
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly values: TransactionFieldValueRepositoryPort,
    @Inject(TRANSACTION_SCOPE_LOOKUP) private readonly movements: TransactionScopeLookupPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(): Promise<void> {}

  protected async handle(query: PreviewAssignmentQuery): Promise<customFields.AssignmentPreview> {
    const field = await this.fields.findOwned(query.userId, query.fieldId);
    if (!field) throw new CustomFieldNotFoundError();
    const value = query.body.value === null ? null : field.parseValue(query.body.value, "value");
    const plan = await planAssignment(
      { fields: this.fields, values: this.values, movements: this.movements, cards: this.cards },
      query.userId,
      field,
      query.body.target,
    );
    const withOtherValue = plan.inScope.filter((id) => {
      const held = plan.current.get(id);
      return held !== undefined && held !== value;
    }).length;
    return { inScope: plan.inScope.length, outOfScope: plan.outOfScope, withOtherValue };
  }
}

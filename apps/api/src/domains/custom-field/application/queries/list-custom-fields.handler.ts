import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { customFields } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../domain/ports/custom-field.repository.port";
import { ListCustomFieldsQuery } from "./custom-field.queries";

/** The person's fields, each with how many movements hold a value (what deleting it
 * would erase, and what locks its type). */
@Injectable()
@QueryHandler(ListCustomFieldsQuery)
export class ListCustomFieldsQueryHandler extends BaseQueryHandler<
  ListCustomFieldsQuery,
  customFields.CustomField[]
> {
  constructor(
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly values: TransactionFieldValueRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(): Promise<void> {}

  protected async handle(query: ListCustomFieldsQuery): Promise<customFields.CustomField[]> {
    const [fields, counts] = await Promise.all([
      this.fields.listForUser(query.userId),
      this.values.countByField(query.userId),
    ]);
    return fields.map((f) => f.toContract(counts.get(f.id) ?? 0));
  }
}

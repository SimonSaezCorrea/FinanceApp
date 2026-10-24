import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { customFields } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  CATEGORY_LOOKUP,
  type CategoryLookupPort,
} from "../../../category/domain/ports/category-lookup.port";
import type { CustomField } from "../../../custom-field/domain/custom-field.aggregate";
import { CustomFieldNotFoundError } from "../../../custom-field/domain/errors";
import {
  CUSTOM_FIELD_REPOSITORY,
  type CustomFieldRepositoryPort,
} from "../../../custom-field/domain/ports/custom-field.repository.port";
import {
  TRANSACTION_FIELD_VALUE_REPOSITORY,
  type TransactionFieldValueRepositoryPort,
} from "../../../transaction-field-value/domain/ports/transaction-field-value.repository.port";
import {
  TRANSACTION_REPOSITORY,
  type TransactionListFilter,
  type TransactionRepositoryPort,
} from "../../domain/ports/transaction.repository.port";
import { scopeWhere } from "../../domain/scope-where";
import { SummarizeByFieldQuery } from "./summarize-by-field.query";

/**
 * The summary of one custom field (FR-016c): for each value (yes/no and list) — or
 * "has a value" for text, number and date — plus "no value" within its scope, how
 * many movements and their totals, computed by the SAME `summary` the Movimientos
 * KPIs use, so a bucket and the list it opens always agree.
 */
@Injectable()
@QueryHandler(SummarizeByFieldQuery)
export class SummarizeByFieldQueryHandler extends BaseQueryHandler<
  SummarizeByFieldQuery,
  customFields.FieldSummary,
  CustomField
> {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly repo: TransactionRepositoryPort,
    @Inject(CATEGORY_LOOKUP) private readonly categories: CategoryLookupPort,
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly fields: CustomFieldRepositoryPort,
    @Inject(TRANSACTION_FIELD_VALUE_REPOSITORY)
    private readonly values: TransactionFieldValueRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(query: SummarizeByFieldQuery): Promise<CustomField> {
    const field = await this.fields.findOwned(query.userId, query.fieldId);
    if (!field) throw new CustomFieldNotFoundError();
    return field;
  }

  protected async handle(
    query: SummarizeByFieldQuery,
    field: CustomField,
  ): Promise<customFields.FieldSummary> {
    const { userId } = query;
    const internal = await Promise.all([
      this.categories.idForSystemCode("STATEMENT_PAYMENT"),
      this.categories.idForSystemCode("CARD_PREPAYMENT"),
    ]);
    const withValue = await this.values.idsMatching(userId, field.id, { kind: "any" });

    const buckets: { key: string; where: TransactionListFilter }[] = [];
    if (field.type === "BOOLEAN" || field.type === "OPTION") {
      const keys = field.type === "BOOLEAN" ? [true, false] : field.options.map((o) => o.id);
      for (const value of keys) {
        const ids = await this.values.idsMatching(userId, field.id, {
          kind: "equals",
          type: field.type,
          value,
        });
        buckets.push({ key: String(value), where: { ids } });
      }
    } else {
      buckets.push({ key: "hasValue", where: { ids: withValue } });
    }
    buckets.push({
      key: "empty",
      where: {
        excludeIds: withValue,
        scope: scopeWhere(field.scope, await this.cards.kindsForUser(userId)),
      },
    });

    return {
      buckets: await Promise.all(
        buckets.map(async ({ key, where }) => {
          const summary = await this.repo.summary(userId, where, internal);
          return { key, total: summary.total, currencyTotals: summary.currencyTotals };
        }),
      ),
    };
  }
}

import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { imports } from "@finance/contracts";

import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CATEGORY_LOOKUP,
  type CategoryLookupPort,
} from "../../../category/domain/ports/category-lookup.port";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../../transaction/domain/ports/transaction.repository.port";
import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import { generateRowId } from "../../../../infra/id/generate-row-id";
import { planTemplateImport } from "../../domain/template-plan";
import { loadTemplateContext, type TemplateContext } from "../template-context.loader";
import { PreviewTemplateQuery } from "./preview-template.query";

/**
 * What a template would do, without doing it (specs/027, FR-022/FR-023): counts
 * per sheet, the effect on each account under its chosen balance mode, and EVERY
 * problem found — not just the first — each on its sheet and Excel row.
 *
 * Writes nothing: the loader only reads, and the planner is pure.
 */
@Injectable()
@QueryHandler(PreviewTemplateQuery)
export class PreviewTemplateQueryHandler extends BaseQueryHandler<
  PreviewTemplateQuery,
  imports.TemplatePreviewResponse,
  TemplateContext
> {
  constructor(
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(TRANSACTION_REPOSITORY) private readonly movements: TransactionRepositoryPort,
    @Inject(CATEGORY_LOOKUP) private readonly categories: CategoryLookupPort,
  ) {
    super();
  }

  protected loadContext(query: PreviewTemplateQuery): Promise<TemplateContext> {
    return loadTemplateContext(
      { accounts: this.accounts, movements: this.movements, categories: this.categories },
      query.userId,
      query.input,
    );
  }

  protected async handle(
    query: PreviewTemplateQuery,
    context: TemplateContext,
  ): Promise<imports.TemplatePreviewResponse> {
    const plan = planTemplateImport(query.input, context.lookup, {
      mode: "collect",
      newId: generateRowId,
      now: new Date(),
    });
    return {
      valid: plan.issues.length === 0,
      counts: plan.counts,
      accounts: plan.accounts,
      errors: plan.issues.map(({ status: _status, ...issue }) => issue),
    };
  }
}

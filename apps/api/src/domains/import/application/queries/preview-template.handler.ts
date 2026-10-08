import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { imports } from "@finance/contracts";

import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../../credit-statement/domain/ports/credit-statement.repository.port";
import {
  DEBT_REPOSITORY,
  type DebtRepositoryPort,
} from "../../../debt/domain/ports/debt.repository.port";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../../installment-plan/domain/ports/installment-plan.repository.port";
import {
  RECURRING_EXPENSE_REPOSITORY,
  type RecurringExpenseRepositoryPort,
} from "../../../recurring-expense/domain/ports/recurring-expense.repository.port";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../../savings-entry/domain/ports/savings-entry.repository.port";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../../savings-goal/domain/ports/savings-goal.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
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
import { countReplacement } from "../template-replacement";
import { PreviewTemplateQuery } from "./preview-template.query";

/**
 * What a template would do, without doing it (specs/027, FR-022/FR-023): counts
 * per sheet, the effect on each account under its chosen balance mode, and EVERY
 * problem found — not just the first — each on its sheet and Excel row.
 *
 * Writes nothing: the loader only reads, and the planner is pure. A REPLACE also
 * counts what it would delete, so the user sees it before confirming.
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
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statements: CreditStatementRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly writer: TransactionWriterRepositoryPort,
    @Inject(DEBT_REPOSITORY) private readonly debts: DebtRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plans: InstallmentPlanRepositoryPort,
    @Inject(RECURRING_EXPENSE_REPOSITORY)
    private readonly recurring: RecurringExpenseRepositoryPort,
    @Inject(SAVINGS_GOAL_REPOSITORY) private readonly goals: SavingsGoalRepositoryPort,
    @Inject(SAVINGS_ENTRY_REPOSITORY) private readonly entries: SavingsEntryRepositoryPort,
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
    const replaces =
      query.input.mode === "REPLACE"
        ? await countReplacement(
            {
              accounts: this.accounts,
              cards: this.cards,
              statements: this.statements,
              movements: this.writer,
              debts: this.debts,
              plans: this.plans,
              recurring: this.recurring,
              goals: this.goals,
              entries: this.entries,
            },
            query.userId,
          )
        : null;
    return {
      valid: plan.issues.length === 0,
      replaces,
      counts: plan.counts,
      accounts: plan.accounts,
      errors: plan.issues.map(({ status: _status, ...issue }) => issue),
    };
  }
}

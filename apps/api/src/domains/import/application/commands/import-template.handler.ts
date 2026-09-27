import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { imports } from "@finance/contracts";
import { subtractMoney } from "@finance/money";

import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CATEGORY_LOOKUP,
  type CategoryLookupPort,
} from "../../../category/domain/ports/category-lookup.port";
import {
  CREDIT_STATEMENT_REPOSITORY,
  type CreditStatementRepositoryPort,
} from "../../../credit-statement/domain/ports/credit-statement.repository.port";
import type { Debt } from "../../../debt/domain/debt.aggregate";
import {
  DEBT_REPOSITORY,
  type DebtRepositoryPort,
} from "../../../debt/domain/ports/debt.repository.port";
import type { InstallmentPlan } from "../../../installment-plan/domain/installment-plan.aggregate";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../../installment-plan/domain/ports/installment-plan.repository.port";
import {
  RECURRING_EXPENSE_REPOSITORY,
  type RecurringExpenseRepositoryPort,
} from "../../../recurring-expense/domain/ports/recurring-expense.repository.port";
import { SavingsEntry } from "../../../savings-entry/domain/savings-entry.aggregate";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../../savings-entry/domain/ports/savings-entry.repository.port";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../../savings-goal/domain/ports/savings-goal.repository.port";
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepositoryPort,
} from "../../../transaction/domain/ports/transaction.repository.port";
import {
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import { generateRowId } from "../../../../infra/id/generate-row-id";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import { planTemplateImport, type TemplatePlanResult } from "../../domain/template-plan";
import { loadTemplateContext } from "../template-context.loader";
import { ImportTemplateCommand } from "./import-template.command";

/** 5.000 rows don't fit in Prisma's default 5 s interactive-transaction timeout. */
export const TEMPLATE_IMPORT_TX_TIMEOUT_MS = 60_000;

interface Context {
  plan: TemplatePlanResult;
  createdAt: Map<string, Date>;
  systemCategories: Record<"DEBTS" | "SAVINGS" | "INTEREST", string>;
}

/**
 * Applies a whole template (specs/027) all-or-nothing: every debt, plan,
 * recurring series, goal, contribution and movement it describes, plus each
 * account's balance/credit-pool effect, commit in ONE transaction together with
 * the idempotency record — or nothing does (FR-025, FR-026; Principle VII form
 * (c), operation `import.template`).
 *
 * The rules were already applied by `planTemplateImport` in `loadContext`
 * (`throw` mode: the first problem refuses the import, naming its sheet and
 * row). This handler only writes, each table through its own domain's port
 * (Principle VI), in an order the foreign keys allow: the rows movements point
 * at (debts, plans, savings entries) first, then the movements, then the state
 * that points back at movements (debt/plan payment records).
 */
@Injectable()
@CommandHandler(ImportTemplateCommand)
export class ImportTemplateHandler extends BaseIdempotentCommandHandler<
  ImportTemplateCommand,
  imports.TemplateImportResult,
  Context
> {
  protected readonly operation = "import.template";
  protected override readonly successStatus = 201;

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(TRANSACTION_REPOSITORY) private readonly movements: TransactionRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly writer: TransactionWriterRepositoryPort,
    @Inject(CREDIT_STATEMENT_REPOSITORY)
    private readonly statements: CreditStatementRepositoryPort,
    @Inject(DEBT_REPOSITORY) private readonly debts: DebtRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plans: InstallmentPlanRepositoryPort,
    @Inject(RECURRING_EXPENSE_REPOSITORY)
    private readonly recurring: RecurringExpenseRepositoryPort,
    @Inject(SAVINGS_GOAL_REPOSITORY) private readonly goals: SavingsGoalRepositoryPort,
    @Inject(SAVINGS_ENTRY_REPOSITORY) private readonly entries: SavingsEntryRepositoryPort,
    @Inject(CATEGORY_LOOKUP) private readonly categories: CategoryLookupPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: ImportTemplateCommand): unknown {
    return command.input;
  }

  protected async loadContext(command: ImportTemplateCommand): Promise<Context> {
    const { lookup, createdAt } = await loadTemplateContext(
      { accounts: this.accounts, movements: this.movements, categories: this.categories },
      command.userId,
      command.input,
    );
    const plan = planTemplateImport(command.input, lookup, {
      mode: "throw",
      newId: generateRowId,
      now: new Date(),
    });
    const [DEBTS, SAVINGS, INTEREST] = await Promise.all([
      this.categories.idForSystemCode("DEBTS"),
      this.categories.idForSystemCode("SAVINGS"),
      this.categories.idForSystemCode("INTEREST"),
    ]);
    return { plan, createdAt, systemCategories: { DEBTS, SAVINGS, INTEREST } };
  }

  protected async handleIdempotent(
    command: ImportTemplateCommand,
    context: Context,
    complete: CompleteFn<imports.TemplateImportResult>,
  ): Promise<HandleResult<imports.TemplateImportResult>> {
    const { userId } = command;
    const { plan } = context;

    const result = await this.prisma.$transaction(
      async (tx) => {
        // 1. Rows the movements will point at.
        const createdDebts: (Debt | null)[] = [];
        for (const debt of plan.debts) {
          createdDebts.push(debt ? await this.debts.createWithTx(tx, userId, debt.plan) : null);
        }
        const createdPlans: (InstallmentPlan | null)[] = [];
        for (const p of plan.plans) {
          createdPlans.push(p ? await this.plans.createWithTx(tx, userId, p.plan) : null);
        }
        const entryIds = new Map<string, string>();
        for (const [goalIndex, goal] of plan.goals.entries()) {
          const created = await this.goals.createWithTx(tx, userId, goal.plan);
          for (const [i, c] of goal.contributions.entries()) {
            const entry = await this.entries.createWithTx(
              tx,
              userId,
              SavingsEntry.planCreation({
                savingsGoalId: created.id,
                amount: c.amount,
                currency: c.currency,
                contributedAt: c.contributedAt,
                bankAccountId: c.accountId,
                transactionId: c.transactionId,
              }),
            );
            entryIds.set(`${goalIndex}|${i}`, entry.id);
          }
        }
        const recurringIds: (string | null)[] = [];
        for (const series of plan.recurring) {
          recurringIds.push(
            series ? (await this.recurring.createWithTx(tx, userId, series)).id : null,
          );
        }

        // 2. The movements, in one bulk insert. Those drawing on a credit pool join
        //    the account's open billing period — resolved INSIDE this transaction
        //    so a failed import can't leave one behind.
        const openPeriod = new Map<string, string>();
        for (const m of plan.movements) {
          if (!m.drawsOnCredit || openPeriod.has(m.accountId)) continue;
          const open = await this.statements.findOrCreateOpenForAccountWithTx(
            tx,
            m.accountId,
            context.createdAt.get(m.accountId)!,
          );
          openPeriod.set(m.accountId, open.id);
        }
        await this.writer.createManyWithTx(
          tx,
          plan.movements.map((m) => ({
            id: m.id,
            userId,
            bankAccountId: m.accountId,
            type: m.type,
            amount: m.amount,
            currency: m.currency,
            occurredAt: m.occurredAt,
            description: m.description,
            observation: m.observation,
            emisor: m.emisor,
            receptor: m.receptor,
            lugar: m.lugar,
            categoryId: m.systemCategory
              ? context.systemCategories[m.systemCategory]
              : m.categoryId,
            cardId: m.cardId,
            financeCharge: m.financeCharge,
            creditStatementId: m.drawsOnCredit ? openPeriod.get(m.accountId)! : null,
            transferGroupId: m.transferGroupId,
            debtId: m.link?.kind === "debt" ? (createdDebts[m.link.index]?.id ?? null) : null,
            installmentPlanId:
              m.link?.kind === "plan" ? (createdPlans[m.link.index]?.id ?? null) : null,
            recurringExpenseId:
              m.link?.kind === "recurring" ? (recurringIds[m.link.index] ?? null) : null,
            savingsEntryId:
              m.link?.kind === "contribution"
                ? (entryIds.get(`${m.link.goalIndex}|${m.link.contributionIndex}`) ?? null)
                : null,
          })),
        );

        // 3. State that records which movement paid what.
        for (const [index, debt] of plan.debts.entries()) {
          const created = createdDebts[index];
          if (!debt || !created || debt.payments.length === 0) continue;
          for (const payment of debt.payments) created.registerPayment(payment);
          await this.debts.saveWithTx(tx, created);
        }
        for (const [index, p] of plan.plans.entries()) {
          const created = createdPlans[index];
          if (!p || !created) continue;
          for (const payment of p.payments) {
            const { carryDeltas } = created.payInstallment(
              payment.sequence,
              payment.amount,
              payment.paidAt,
              payment.transactionId,
            );
            await this.plans.savePaymentWithTx(tx, created, payment.sequence, carryDeltas);
          }
        }

        // 4. Each account's net effect — onto today's figures, or onto the opening
        //    ones when today's already include this history (FR-022a).
        for (const effect of plan.accounts) {
          const cash = Number(effect.netCash) !== 0;
          const credit = Number(effect.netCredit) !== 0;
          if (effect.mode === "INCLUDED") {
            if (cash || credit) {
              await this.accounts.adjustOpeningWithTx(
                tx,
                effect.accountId,
                subtractMoney("0", effect.netCash),
                subtractMoney("0", effect.netCredit),
              );
            }
            continue;
          }
          if (cash)
            await this.accounts.incrementBalanceWithTx(tx, effect.accountId, effect.netCash);
          if (credit) {
            await this.accounts.incrementCreditUsedWithTx(tx, effect.accountId, effect.netCredit);
          }
        }

        const body = { counts: plan.counts };
        await complete(tx, body);
        return body;
      },
      { timeout: TEMPLATE_IMPORT_TX_TIMEOUT_MS, maxWait: 10_000 },
    );

    return { result, events: [] };
  }
}

import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { imports } from "@finance/contracts";
import { subtractMoney, toMoney } from "@finance/money";

import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
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
import { TemplateRowRejectedError } from "../../domain/errors";
import { planTemplateImport, type TemplatePlanResult } from "../../domain/template-plan";
import { loadTemplateContext } from "../template-context.loader";
import { purgeUserDataWithTx, type ReplacementPorts } from "../template-replacement";
import { ImportTemplateCommand } from "./import-template.command";

/** 5.000 rows don't fit in Prisma's default 5 s interactive-transaction timeout. */
export const TEMPLATE_IMPORT_TX_TIMEOUT_MS = 60_000;

/** Upper bound of "everything after the close" when moving later movements on. */
const FAR_FUTURE = new Date(Date.UTC(9999, 11, 31));

interface Context {
  plan: TemplatePlanResult;
  createdAt: Map<string, Date>;
  systemCategories: Record<"DEBTS" | "SAVINGS" | "INTEREST" | "STATEMENT_PAYMENT", string>;
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
 *
 * Template v2 adds, in the same transaction: a REPLACE deletes every account,
 * card and record of the user first; the accounts and cards the file defines are
 * created and their temporary ids translated everywhere; and (REPLACE only) the
 * billing periods are rebuilt with the same steps as "Generar facturación" and,
 * when paid, settled like the "Pagar" button.
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
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
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
    const [DEBTS, SAVINGS, INTEREST, STATEMENT_PAYMENT] = await Promise.all([
      this.categories.idForSystemCode("DEBTS"),
      this.categories.idForSystemCode("SAVINGS"),
      this.categories.idForSystemCode("INTEREST"),
      this.categories.idForSystemCode("STATEMENT_PAYMENT"),
    ]);
    return {
      plan,
      createdAt,
      systemCategories: { DEBTS, SAVINGS, INTEREST, STATEMENT_PAYMENT },
    };
  }

  private replacementPorts(): ReplacementPorts {
    return {
      accounts: this.accounts,
      cards: this.cards,
      statements: this.statements,
      movements: this.writer,
      debts: this.debts,
      plans: this.plans,
      recurring: this.recurring,
      goals: this.goals,
      entries: this.entries,
    };
  }

  protected async handleIdempotent(
    command: ImportTemplateCommand,
    context: Context,
    complete: CompleteFn<imports.TemplateImportResult>,
  ): Promise<HandleResult<imports.TemplateImportResult>> {
    const { userId } = command;
    const { plan } = context;

    const replace = command.input.mode === "REPLACE";

    const result = await this.prisma.$transaction(
      async (tx) => {
        // 0. A REPLACE starts from nothing. Then the accounts and cards the file
        //    defines: real ids for their temporary keys, translated everywhere below.
        if (replace) await purgeUserDataWithTx(this.replacementPorts(), tx, userId);
        const ids = new Map<string, string>();
        const createdAt = new Map(context.createdAt);
        for (const a of plan.newAccounts) {
          const created = await this.accounts.createWithCardsWithTx(tx, userId, {
            ...a.plan,
            status: "ACTIVE",
            accountAlias: null,
            billingCycleDay: null,
            paymentMethod: "MANUAL",
            cards: a.cards.map((c) => c.plan),
          });
          ids.set(a.tempId, created.id);
          a.cards.forEach((c, i) => ids.set(c.tempId, created.cardIds[i]!));
          // Its first billing period starts with its oldest movement, not today.
          const first = plan.movements
            .filter((m) => m.accountId === a.tempId)
            .reduce<Date | null>(
              (min, m) => (!min || m.occurredAt < min ? m.occurredAt : min),
              null,
            );
          createdAt.set(created.id, first ?? new Date());
        }
        // There is always a cash account (`CASH_ACCOUNT_REQUIRED`).
        if (replace && !plan.newAccounts.some((a) => a.plan.type === "CASH")) {
          await this.accounts.createWithCardsWithTx(tx, userId, {
            name: "Efectivo",
            type: "CASH",
            status: "ACTIVE",
            currency: "CLP",
            institution: null,
            institutionId: null,
            accountNumber: null,
            accountAlias: null,
            initialBalance: "0",
            overdraftLimit: "0",
            balanceCeiling: null,
            creditLimit: "0",
            creditUsedInitial: "0",
            billingCycleDay: null,
            paymentMethod: "MANUAL",
            cards: [],
          });
        }
        const id = <T extends string | null | undefined>(value: T): T =>
          (value ? (ids.get(value) ?? value) : value) as T;

        // 1. Rows the movements will point at.
        const createdDebts: (Debt | null)[] = [];
        for (const debt of plan.debts) {
          createdDebts.push(
            debt
              ? await this.debts.createWithTx(tx, userId, {
                  ...debt.plan,
                  paymentAccountId: id(debt.plan.paymentAccountId),
                })
              : null,
          );
        }
        const createdPlans: (InstallmentPlan | null)[] = [];
        for (const p of plan.plans) {
          createdPlans.push(
            p
              ? await this.plans.createWithTx(tx, userId, {
                  ...p.plan,
                  cardId: id(p.plan.cardId),
                  paymentAccountId: id(p.plan.paymentAccountId),
                })
              : null,
          );
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
                bankAccountId: id(c.accountId),
                transactionId: c.transactionId,
              }),
            );
            entryIds.set(`${goalIndex}|${i}`, entry.id);
          }
        }
        const recurringIds: (string | null)[] = [];
        for (const series of plan.recurring) {
          recurringIds.push(
            series
              ? (
                  await this.recurring.createWithTx(tx, userId, {
                    ...series,
                    bankAccountId: id(series.bankAccountId),
                    cardId: id(series.cardId),
                  })
                ).id
              : null,
          );
        }

        // 2. The movements, in one bulk insert. Those drawing on a credit pool join
        //    the account's open billing period — resolved INSIDE this transaction
        //    so a failed import can't leave one behind.
        //    Spec 028: one open period per (account, currency).
        const openPeriod = new Map<string, string>();
        const periodKey = (m: { accountId: string; statementCurrency: string | null }) =>
          `${id(m.accountId)}|${m.statementCurrency}`;
        for (const m of plan.movements) {
          if (!m.statementCurrency || openPeriod.has(periodKey(m))) continue;
          const open = await this.statements.findOrCreateOpenForAccountWithTx(
            tx,
            id(m.accountId),
            createdAt.get(id(m.accountId))!,
            m.statementCurrency,
          );
          openPeriod.set(periodKey(m), open.id);
        }
        await this.writer.createManyWithTx(
          tx,
          plan.movements.map((m) => ({
            id: m.id,
            userId,
            bankAccountId: id(m.accountId),
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
            cardId: id(m.cardId),
            financeCharge: m.financeCharge,
            creditStatementId: m.statementCurrency ? openPeriod.get(periodKey(m))! : null,
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
          for (const payment of debt.payments) {
            created.registerPayment({ ...payment, accountId: id(payment.accountId) });
          }
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
        for (const raw of plan.accounts) {
          const effect = { ...raw, accountId: id(raw.accountId) };
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

        // 5. Billing periods (REPLACE): the steps of "Generar facturación", then —
        //    when the file says it was paid — those of "Pagar".
        for (const st of plan.statements) {
          const accountId = id(st.accountId);
          let open = await this.statements.findOpenForAccount(accountId, st.currency, tx);
          if (!open) {
            await this.statements.findOrCreateOpenForAccountWithTx(
              tx,
              accountId,
              st.periodStart,
              st.currency,
            );
            open = (await this.statements.findOpenForAccount(accountId, st.currency, tx))!;
          }
          open.generate({
            periodStart: st.periodStart,
            closedAt: st.closedAt,
            dueDate: st.dueDate,
          });
          await this.statements.saveWithTx(tx, open);
          // A credit card account: every movement on it belongs to its periods.
          const window = { accountId, cardIds: null, currency: st.currency };
          await this.writer.relinkToStatementWithTx(tx, {
            ...window,
            statementId: open.id,
            from: st.periodStart,
            to: st.closedAt,
          });
          const next = await this.statements.findOrCreateCarryOverTargetWithTx(tx, {
            accountId,
            excludeStatementId: open.id,
            periodStart: new Date(st.closedAt.getTime() + 1),
            currency: st.currency,
          });
          await this.writer.relinkToStatementWithTx(tx, {
            ...window,
            statementId: next.id,
            from: st.closedAt,
            to: FAR_FUTURE,
          });
          const account = plan.newAccounts.find((a) => a.tempId === st.accountId);
          if (account && st.currency === account.plan.currency) {
            const creditCards = account.cards
              .filter((c) => c.plan.kind === "CREDIT")
              .map((c) => id(c.tempId));
            const billable = await this.plans.listBillableForCards(creditCards, st.closedAt, tx);
            await this.plans.stampBillableWithTx(
              tx,
              billable.map((b) => b.paymentId),
              open.id,
            );
          }
          if (!st.paidAt) continue;

          const [linked, billed] = await Promise.all([
            this.statements.sumLinkedTransactions(open.id, tx),
            this.plans.billedInstallmentsForStatement(open.id, tx),
          ]);
          const total = open.totalFor(linked, billed.amount);
          const paid = st.paidAmount ?? total;
          if (!toMoney(paid).greaterThan(0)) continue; // nothing owed: nothing to settle
          let carryOver = "0";
          try {
            carryOver =
              st.paymentTransactionId && st.paidFromAccountId
                ? open.payTowards(
                    total,
                    paid,
                    id(st.paidFromAccountId),
                    st.paymentTransactionId,
                    st.paidAt,
                  ).carryOver
                : open.settleImported(total, paid, st.paidAt).carryOver;
          } catch (error) {
            const { code, httpStatus } = error as { code?: unknown; httpStatus?: unknown };
            if (typeof code !== "string" || typeof httpStatus !== "number") throw error;
            throw new TemplateRowRejectedError(
              code,
              httpStatus as 400 | 404 | 409,
              "statements",
              st.row,
            );
          }
          if (toMoney(carryOver).greaterThan(0)) {
            open.markCarriedTo(next.id);
            await this.statements.addCarriedOverWithTx(tx, next.id, carryOver);
          }
          await this.statements.saveWithTx(tx, open);
          await this.plans.settleForStatementWithTx(tx, open.id, st.paidAt);
        }

        // 6. The accounts' final status (they were created active so their history
        //    could be written).
        for (const a of plan.newAccounts) {
          if (a.finalStatus !== "ACTIVE") {
            await this.accounts.setStatusWithTx(tx, id(a.tempId), a.finalStatus);
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

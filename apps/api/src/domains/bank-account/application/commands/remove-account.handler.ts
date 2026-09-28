import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
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
  TRANSACTION_WRITER_REPOSITORY,
  type TransactionWriterRepositoryPort,
} from "../../../transaction/domain/ports/transaction-writer.repository.port";
import { AccountNotFoundError, CashAccountRequiredError } from "../../domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { netByAccount, type AccountDelta, type AccountDeletionScope } from "../account-deletion";
import { AccountDeletionScopeLoader } from "../account-deletion.loader";
import { RemoveAccountCommand } from "./remove-account.command";

interface Context {
  command: RemoveAccountCommand;
  scope: AccountDeletionScope;
}

/**
 * Deletes an account and, on request, what hangs off it — its movements (with the
 * other leg of each transfer, and the payments other accounts made into its
 * periods), the instalment plans of its cards, its recurring series and the savings
 * contributions made from it. Whatever wasn't chosen stays, unlinked (the schema's
 * SetNull); debts are never deleted, only unlinked.
 *
 * Every other account the chosen data touched gets its money back — the same
 * reversal each piece gets when deleted on its own (`plan-deletion` for plans,
 * `reverseBalanceDelta` for movements) — and all of it happens in ONE
 * `prisma.$transaction`: half a deletion is money invented or lost.
 *
 * Retry safety (Principle VII, form (a)): the account row is DELETED first inside
 * the transaction. A second, concurrent attempt blocks on that row's lock, then
 * deletes nothing and rolls back with `ACCOUNT_NOT_FOUND` — so balances are never
 * given back twice.
 */
@Injectable()
@CommandHandler(RemoveAccountCommand)
export class RemoveAccountHandler extends BaseCommandHandler<RemoveAccountCommand, void, Context> {
  constructor(
    eventBus: EventBus,
    private readonly prisma: PrismaService,
    private readonly scopes: AccountDeletionScopeLoader,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(TRANSACTION_WRITER_REPOSITORY)
    private readonly transactions: TransactionWriterRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plans: InstallmentPlanRepositoryPort,
    @Inject(RECURRING_EXPENSE_REPOSITORY)
    private readonly recurring: RecurringExpenseRepositoryPort,
    @Inject(SAVINGS_ENTRY_REPOSITORY) private readonly savings: SavingsEntryRepositoryPort,
    @Inject(DEBT_REPOSITORY) private readonly debts: DebtRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RemoveAccountCommand): Promise<Context> {
    const scope = await this.scopes.load(command.userId, command.accountId);
    if (!scope) throw new AccountNotFoundError();
    if (
      scope.account.type === "CASH" &&
      (await this.accountRepo.countByType(command.userId, "CASH")) <= 1
    ) {
      throw new CashAccountRequiredError();
    }
    return { command, scope };
  }

  protected async handle(): Promise<HandleResult<void>> {
    return { result: undefined, events: [] };
  }

  protected override async persist({ command, scope }: Context): Promise<void> {
    const { userId, accountId, options } = command;
    const movementIds = new Set<string>();
    const balances: AccountDelta[] = [];
    const credits: AccountDelta[] = [];
    if (options.movements) {
      scope.movements.ids.forEach((id) => movementIds.add(id));
      balances.push(...scope.movements.balances);
      credits.push(...scope.movements.credits);
    }
    if (options.installmentPlans) {
      scope.installmentPlans.ids.forEach((id) => movementIds.add(id));
      balances.push(...scope.installmentPlans.balances);
      credits.push(...scope.installmentPlans.credits);
    }

    await this.prisma.$transaction(async (tx) => {
      if (!(await this.accountRepo.removeWithTx(tx, userId, accountId))) {
        throw new AccountNotFoundError();
      }
      // A debt's last payment moved money on this account: undoing it later can't
      // reverse a balance that no longer exists.
      await this.debts.clearLastPaymentForAccountWithTx(tx, userId, accountId);
      await this.transactions.deleteManyWithTx(tx, [...movementIds]);
      for (const { accountId: other, delta } of netByAccount(balances, accountId)) {
        await this.accountRepo.incrementBalanceWithTx(tx, other, delta);
      }
      for (const { accountId: other, delta } of netByAccount(credits, accountId)) {
        await this.accountRepo.incrementCreditUsedWithTx(tx, other, delta);
      }
      if (options.installmentPlans) {
        for (const planId of scope.installmentPlans.planIds) {
          await this.plans.removeWithTx(tx, userId, planId);
        }
      }
      if (options.recurring) {
        await this.recurring.removeManyWithTx(tx, userId, scope.recurringIds);
      }
      if (options.savingsEntries) {
        await this.savings.removeManyWithTx(tx, userId, scope.savingsEntryIds);
      }
    });
  }
}

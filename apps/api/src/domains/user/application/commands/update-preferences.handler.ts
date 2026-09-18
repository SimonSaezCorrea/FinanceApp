import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BANK_ACCOUNT_CURRENCY_USAGE } from "../../../bank-account/domain/ports/currency-usage-lookup.port";
import { CARD_LIMIT_CURRENCY_USAGE } from "../../../card-limit/domain/ports/currency-usage-lookup.port";
import { DEBT_CURRENCY_USAGE } from "../../../debt/domain/ports/currency-usage-lookup.port";
import { INSTALLMENT_PLAN_CURRENCY_USAGE } from "../../../installment-plan/domain/ports/currency-usage-lookup.port";
import { RECURRING_EXPENSE_CURRENCY_USAGE } from "../../../recurring-expense/domain/ports/currency-usage-lookup.port";
import { SAVINGS_ENTRY_CURRENCY_USAGE } from "../../../savings-entry/domain/ports/currency-usage-lookup.port";
import { SAVINGS_GOAL_CURRENCY_USAGE } from "../../../savings-goal/domain/ports/currency-usage-lookup.port";
import { TRANSACTION_CURRENCY_USAGE } from "../../../transaction/domain/ports/currency-usage-lookup.port";
import type { CurrencyUsageLookupPort } from "../../../bank-account/domain/ports/currency-usage-lookup.port";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { CurrencyInUseError, UnauthorizedError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { UpdatePreferencesCommand } from "./update-preferences.command";

@Injectable()
@CommandHandler(UpdatePreferencesCommand)
export class UpdatePreferencesHandler extends BaseCommandHandler<
  UpdatePreferencesCommand,
  auth.CurrentUser,
  User
> {
  private readonly currencyUsagePorts: CurrencyUsageLookupPort[];

  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(BANK_ACCOUNT_CURRENCY_USAGE) bankAccountUsage: CurrencyUsageLookupPort,
    @Inject(TRANSACTION_CURRENCY_USAGE) transactionUsage: CurrencyUsageLookupPort,
    @Inject(INSTALLMENT_PLAN_CURRENCY_USAGE) installmentPlanUsage: CurrencyUsageLookupPort,
    @Inject(DEBT_CURRENCY_USAGE) debtUsage: CurrencyUsageLookupPort,
    @Inject(SAVINGS_GOAL_CURRENCY_USAGE) savingsGoalUsage: CurrencyUsageLookupPort,
    @Inject(SAVINGS_ENTRY_CURRENCY_USAGE) savingsEntryUsage: CurrencyUsageLookupPort,
    @Inject(RECURRING_EXPENSE_CURRENCY_USAGE) recurringExpenseUsage: CurrencyUsageLookupPort,
    @Inject(CARD_LIMIT_CURRENCY_USAGE) cardLimitUsage: CurrencyUsageLookupPort,
  ) {
    super(eventBus);
    // Order is irrelevant — every port is queried for every removed currency.
    this.currencyUsagePorts = [
      bankAccountUsage,
      transactionUsage,
      installmentPlanUsage,
      debtUsage,
      savingsGoalUsage,
      savingsEntryUsage,
      recurringExpenseUsage,
      cardLimitUsage,
    ];
  }

  protected async loadContext(command: UpdatePreferencesCommand): Promise<User> {
    const user = await this.repo.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    return user;
  }

  protected async handle(
    command: UpdatePreferencesCommand,
    user: User,
  ): Promise<HandleResult<auth.CurrentUser>> {
    const nextExtraCurrencies = command.input.extraCurrencies;
    if (nextExtraCurrencies !== undefined) {
      const removed = user
        .snapshot()
        .extraCurrencies.filter((currency) => !nextExtraCurrencies.includes(currency));
      await this.assertNoneInUse(command.userId, removed);
    }
    user.applyPreferencesUpdate(command.input);
    return { result: user.toContract(), events: [] };
  }

  protected override async persist(user: User): Promise<void> {
    await this.repo.save(user);
  }

  /** FR-004a: a currency can only leave `extraCurrencies` once nothing of the
   * user's own still uses it — checked across the 8 tables that carry a
   * `currency` column, each behind its own table's lookup port (Constitution
   * VI: `user` never queries another table directly). */
  private async assertNoneInUse(userId: string, removed: string[]): Promise<void> {
    if (removed.length === 0) return;
    for (const currency of removed) {
      const inUse = await Promise.all(
        this.currencyUsagePorts.map((port) => port.isCurrencyInUse(userId, currency)),
      );
      if (inUse.some(Boolean)) throw new CurrencyInUseError();
    }
  }
}

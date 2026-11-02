import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";
import { toMoney } from "@finance/money";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  CREDIT_STATEMENT_LOOKUP,
  type CreditStatementLookupPort,
} from "../../../credit-statement/domain/ports/credit-statement-lookup.port";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../../installment-plan/domain/ports/installment-plan.repository.port";
import {
  TRANSACTION_SUMS_REPOSITORY,
  type TransactionSumsRepositoryPort,
} from "../../../transaction/domain/ports/transaction-sums.repository.port";
import { BankAccount } from "../../domain/bank-account.aggregate";
import { AccountNotFoundError, CreditPoolInUseError } from "../../domain/errors";
import type { AccountDeactivatedEvent } from "../../domain/events/account-deactivated.event";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { accountsToDtos, extraCreditPool, type LineSums } from "../queries/account-dto.mapper";
import { UpdateAccountCommand } from "./update-account.command";

@Injectable()
@CommandHandler(UpdateAccountCommand)
export class UpdateAccountHandler extends BaseCommandHandler<
  UpdateAccountCommand,
  accounts.BankAccount,
  BankAccount
> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(TRANSACTION_SUMS_REPOSITORY) private readonly sumsRepo: TransactionSumsRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plansRepo: InstallmentPlanRepositoryPort,
    @Inject(CREDIT_STATEMENT_LOOKUP) private readonly statements: CreditStatementLookupPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateAccountCommand): Promise<BankAccount> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    return account;
  }

  protected async handle(
    command: UpdateAccountCommand,
    account: BankAccount,
  ): Promise<HandleResult<accounts.BankAccount>> {
    const { input } = command;
    // A linked institution mirrors its name into `institution` for display.
    const linkedName =
      input.institutionId !== undefined && input.institutionId
        ? await this.accountRepo.institutionName(input.institutionId)
        : undefined;
    // Same rule as creation: the number's format belongs to the institution's
    // country, which may itself be changing in this very patch.
    const effectiveInstitutionId =
      input.institutionId !== undefined ? input.institutionId : account.snapshot().institutionId;
    BankAccount.assertAccountIdentifiers({
      countryAlpha2: effectiveInstitutionId
        ? await this.accountRepo.institutionCountry(effectiveInstitutionId)
        : null,
      accountNumber: input.accountNumber ?? account.accountNumber,
      accountAlias: input.accountAlias ?? account.snapshot().accountAlias,
    });
    account.applyUpdate({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.institutionId !== undefined ? { institutionId: input.institutionId ?? null } : {}),
      ...(linkedName !== undefined
        ? { institution: linkedName ?? undefined }
        : input.institution !== undefined
          ? { institution: input.institution }
          : {}),
      ...(input.accountNumber !== undefined ? { accountNumber: input.accountNumber } : {}),
      ...(input.accountAlias !== undefined ? { accountAlias: input.accountAlias } : {}),
      ...(input.balanceCeiling !== undefined ? { balanceCeiling: input.balanceCeiling } : {}),
      ...(input.initialBalance !== undefined ? { initialBalance: input.initialBalance } : {}),
      ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
      ...(input.creditUsedInitial !== undefined
        ? { creditUsedInitial: input.creditUsedInitial }
        : {}),
      ...(input.billingCycleDay !== undefined ? { billingCycleDay: input.billingCycleDay } : {}),
      ...(input.billingCycleType !== undefined ? { billingCycleType: input.billingCycleType } : {}),
      ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.paymentDueDay !== undefined ? { paymentDueDay: input.paymentDueDay } : {}),
      ...(input.paymentDueCycleType !== undefined
        ? { paymentDueCycleType: input.paymentDueCycleType }
        : {}),
      ...(input.minimumPaymentPercent !== undefined
        ? { minimumPaymentPercent: input.minimumPaymentPercent }
        : {}),
    });
    if (input.extraCreditLimits !== undefined) {
      await this.assertRemovedLinesSettled(command.userId, account, input.extraCreditLimits);
      account.setExtraCreditLimits(input.extraCreditLimits);
    }
    const events: AccountDeactivatedEvent[] = [];
    if (input.status !== undefined) {
      const event = account.setStatus(input.status);
      if (event) events.push(event);
    }
    const [dto] = await accountsToDtos(
      this.sumsRepo,
      command.userId,
      [account],
      this.plansRepo,
      this.statements,
    );
    return { result: dto, events };
  }

  /** A credit line in another currency can only be removed once nothing is owed on it (spec
   * 039): no opening debt, no charge still unpaid, no shortfall carried into a next period. */
  private async assertRemovedLinesSettled(
    userId: string,
    account: BankAccount,
    lines: { currency: string }[],
  ): Promise<void> {
    const removed = account.removedCreditCurrencies(lines);
    if (removed.length === 0) return;
    const lineSums: LineSums = new Map();
    for (const s of await this.sumsRepo.sumsByAccountCurrency(userId, [account.id])) {
      const key = `${s.accountId}:${s.currency}`;
      const entry = lineSums.get(key) ?? { income: "0", expense: "0" };
      if (s.type === "INCOME") entry.income = s.sum;
      else entry.expense = s.sum;
      lineSums.set(key, entry);
    }
    const carried = await this.statements.carriedOverOwed([account.id]);
    for (const line of account.extraCreditLimits) {
      if (!removed.includes(line.currency)) continue;
      const pool = extraCreditPool(line, account.id, lineSums, carried);
      if (!toMoney(pool.used).isZero()) throw new CreditPoolInUseError();
    }
  }

  protected override async persist(account: BankAccount): Promise<void> {
    await this.accountRepo.save(account);
  }
}

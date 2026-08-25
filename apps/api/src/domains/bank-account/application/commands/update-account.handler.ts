import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../../installment-plan/domain/ports/installment-plan.repository.port";
import {
  TRANSACTION_SUMS_REPOSITORY,
  type TransactionSumsRepositoryPort,
} from "../../../transaction/domain/ports/transaction-sums.repository.port";
import { BankAccount } from "../../domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../domain/errors";
import type { AccountDeactivatedEvent } from "../../domain/events/account-deactivated.event";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { accountsToDtos } from "../queries/account-dto.mapper";
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
      ...(input.billingCycleType !== undefined
        ? { billingCycleType: input.billingCycleType }
        : {}),
      ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.paymentDueDay !== undefined ? { paymentDueDay: input.paymentDueDay } : {}),
      ...(input.minimumPaymentPercent !== undefined
        ? { minimumPaymentPercent: input.minimumPaymentPercent }
        : {}),
    });
    const events: AccountDeactivatedEvent[] = [];
    if (input.status !== undefined) {
      const event = account.setStatus(input.status);
      if (event) events.push(event);
    }
    const [dto] = await accountsToDtos(this.sumsRepo, command.userId, [account], this.plansRepo);
    return { result: dto, events };
  }

  protected override async persist(account: BankAccount): Promise<void> {
    await this.accountRepo.save(account);
  }
}

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
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { accountsToDtos } from "../queries/account-dto.mapper";
import { SetAccountStatusCommand } from "./set-account-status.command";

@Injectable()
@CommandHandler(SetAccountStatusCommand)
export class SetAccountStatusHandler extends BaseCommandHandler<
  SetAccountStatusCommand,
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

  protected async loadContext(command: SetAccountStatusCommand): Promise<BankAccount> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    return account;
  }

  protected async handle(
    command: SetAccountStatusCommand,
    account: BankAccount,
  ): Promise<HandleResult<accounts.BankAccount>> {
    const event = account.setStatus(command.status);
    const [dto] = await accountsToDtos(this.sumsRepo, command.userId, [account], this.plansRepo);
    return { result: dto, events: event ? [event] : [] };
  }

  protected override async persist(account: BankAccount): Promise<void> {
    await this.accountRepo.save(account);
  }
}

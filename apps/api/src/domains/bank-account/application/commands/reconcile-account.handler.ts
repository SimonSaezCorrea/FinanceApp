import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
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
import { ReconcileAccountCommand } from "./reconcile-account.command";

/** currentBalance = initialBalance + Σincome − Σexpense (scoped to user + account). */
@Injectable()
@CommandHandler(ReconcileAccountCommand)
export class ReconcileAccountHandler extends BaseCommandHandler<
  ReconcileAccountCommand,
  accounts.BankAccount,
  BankAccount
> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(TRANSACTION_SUMS_REPOSITORY) private readonly sumsRepo: TransactionSumsRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: ReconcileAccountCommand): Promise<BankAccount> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    return account;
  }

  protected async handle(
    command: ReconcileAccountCommand,
    account: BankAccount,
  ): Promise<HandleResult<accounts.BankAccount>> {
    const { income, expense } = await this.sumsRepo.sumByTypeForAccount(
      command.userId,
      command.accountId,
    );
    account.reconcileBalance(income, expense);
    const [dto] = await accountsToDtos(this.sumsRepo, command.userId, [account]);
    return { result: dto, events: [] };
  }

  protected override async persist(account: BankAccount): Promise<void> {
    await this.accountRepo.save(account);
  }
}

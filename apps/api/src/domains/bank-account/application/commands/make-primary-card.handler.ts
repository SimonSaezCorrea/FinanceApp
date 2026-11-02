import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
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
import { AccountNotFoundError } from "../../domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { accountsToDtos } from "../queries/account-dto.mapper";
import { MakePrimaryCardCommand } from "./make-primary-card.command";

/**
 * Makes an active CREDIT card the account's primary (spec 039, US4) — also how an account whose
 * primary was deactivated before spec 039 gets an active one back. The account's credit doesn't
 * move; only the two cards' roles do.
 *
 * Retry-safe by Principle VII form (a): the result is an absolute state ("this card is the
 * primary"), so a replay finds it already primary and changes nothing. The account row is read
 * `FOR UPDATE` in the same transaction that writes the roles, so two concurrent changes run one
 * after the other; the one-primary-per-account index is the database's own guard.
 */
@Injectable()
@CommandHandler(MakePrimaryCardCommand)
export class MakePrimaryCardHandler extends BaseCommandHandler<
  MakePrimaryCardCommand,
  accounts.BankAccount,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(TRANSACTION_SUMS_REPOSITORY) private readonly sumsRepo: TransactionSumsRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plansRepo: InstallmentPlanRepositoryPort,
    @Inject(CREDIT_STATEMENT_LOOKUP) private readonly statements: CreditStatementLookupPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(
    command: MakePrimaryCardCommand,
  ): Promise<HandleResult<accounts.BankAccount>> {
    await this.prisma.$transaction(async (tx) => {
      const account = await this.accountRepo.findByIdForUpdateWithTx(
        tx,
        command.userId,
        command.accountId,
      );
      if (!account) throw new AccountNotFoundError();
      account.findCardOrThrow(command.cardId);
      account.changePrimary(command.cardId);
      await this.accountRepo.saveCardRolesWithTx(tx, account);
    });
    const fresh = await this.accountRepo.findById(command.userId, command.accountId);
    if (!fresh) throw new AccountNotFoundError();
    const [dto] = await accountsToDtos(
      this.sumsRepo,
      command.userId,
      [fresh],
      this.plansRepo,
      this.statements,
    );
    return { result: dto, events: [] };
  }
}

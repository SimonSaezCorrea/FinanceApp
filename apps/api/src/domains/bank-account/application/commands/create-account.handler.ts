import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  TRANSACTION_SUMS_REPOSITORY,
  type TransactionSumsRepositoryPort,
} from "../../../transaction/domain/ports/transaction-sums.repository.port";
import { BankAccount } from "../../domain/bank-account.aggregate";
import type { CreateAccountPlan } from "../../domain/ports/bank-account.repository.port";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { accountsToDtos } from "../queries/account-dto.mapper";
import { CreateAccountCommand } from "./create-account.command";

interface Context {
  plan: CreateAccountPlan;
}

@Injectable()
@CommandHandler(CreateAccountCommand)
export class CreateAccountHandler extends BaseCommandHandler<
  CreateAccountCommand,
  accounts.BankAccount,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(TRANSACTION_SUMS_REPOSITORY) private readonly sumsRepo: TransactionSumsRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CreateAccountCommand): Promise<Context> {
    const { input } = command;
    const institution = input.institutionId
      ? ((await this.accountRepo.institutionName(input.institutionId)) ?? input.institution)
      : input.institution;
    const planned = BankAccount.planCreation({
      type: input.type,
      currency: input.currency,
      initialBalance: input.initialBalance,
      creditLimit: input.creditLimit,
      creditUsedInitial: input.creditUsedInitial,
      cards: input.cards,
    });
    const plan: CreateAccountPlan = {
      name: input.name,
      type: input.type,
      status: input.status,
      currency: input.currency,
      institution: institution ?? null,
      institutionId: input.institutionId ?? null,
      accountNumber: input.accountNumber,
      initialBalance: input.initialBalance ?? "0",
      creditLimit: planned.creditLimit,
      creditUsedInitial: planned.creditUsedInitial,
      billingCycleDay: input.billingCycleDay ?? null,
      paymentMethod: input.paymentMethod ?? "MANUAL",
      cards: planned.cards.map((c) => ({
        name: c.name,
        kind: c.kind,
        last4: c.last4,
        expiryMonth: c.expiryMonth,
        expiryYear: c.expiryYear,
        isActive: c.isActive ?? true,
        isPrimary: c.isPrimary,
        isVirtual: c.isVirtual ?? false,
        isAdditional: c.isAdditional ?? false,
        cardholderName: c.cardholderName ?? null,
        network: c.network ?? null,
        limits: c.cardLimits.map((l) => ({
          currency: l.currency,
          limitAmount: l.limitAmount,
          usedInitial: l.usedInitial,
        })),
      })),
    };
    return { plan };
  }

  protected async handle(
    command: CreateAccountCommand,
    context: Context,
  ): Promise<HandleResult<accounts.BankAccount>> {
    const account = await this.accountRepo.createWithCards(command.userId, context.plan);
    const [dto] = await accountsToDtos(this.sumsRepo, command.userId, [account]);
    return { result: dto, events: [] };
  }
}

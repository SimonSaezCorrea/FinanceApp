import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { currentCycleStart } from "../../../billing-settings/domain/billing-cycle";
import {
  TRANSACTION_SUMS_REPOSITORY,
  type TransactionSumsRepositoryPort,
} from "../../../transaction/domain/ports/transaction-sums.repository.port";
import { BankAccount, type ResolvedCardPlacement } from "../../domain/bank-account.aggregate";
import { AccountNotFoundError } from "../../domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
  type CreateCardPlan,
} from "../../domain/ports/bank-account.repository.port";
import { cardToDto } from "../queries/account-dto.mapper";
import { AddCardCommand } from "./add-card.command";

interface Context {
  account: BankAccount;
  plan: CreateCardPlan;
}

@Injectable()
@CommandHandler(AddCardCommand)
export class AddCardHandler extends BaseCommandHandler<AddCardCommand, accounts.Card, Context> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(TRANSACTION_SUMS_REPOSITORY) private readonly sumsRepo: TransactionSumsRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: AddCardCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    account.assertCardable();
    const placement: ResolvedCardPlacement = account.resolveCardPlacement(command.input, null);
    const plan: CreateCardPlan = {
      name: command.input.name,
      kind: command.input.kind,
      last4: command.input.last4,
      expiryMonth: command.input.expiryMonth,
      expiryYear: command.input.expiryYear,
      isActive: command.input.isActive ?? true,
      isPrimary: placement.isPrimary,
      limits: placement.cardLimits.map((l) => ({
        currency: l.currency,
        limitAmount: l.limitAmount,
        usedInitial: l.usedInitial,
      })),
    };
    if (placement.isPrimary) {
      account.applyUpdate({
        creditLimit: placement.accountCreditLimit,
        creditUsedInitial: placement.accountCreditUsedInitial,
      });
    }
    return { account, plan };
  }

  protected async handle(command: AddCardCommand, context: Context): Promise<HandleResult<accounts.Card>> {
    if (context.plan.isPrimary) {
      // The account's own creditLimit/creditUsedInitial mirror was already
      // applied in loadContext; persist it alongside the new card.
      await this.accountRepo.save(context.account);
    }
    const account = await this.accountRepo.addCard(command.userId, command.accountId, context.plan);
    const created = account.cards.find(
      (c) => c.last4 === context.plan.last4 && c.name === context.plan.name && c.isPrimary === context.plan.isPrimary,
    );
    const currency = account.snapshot().currency;
    const sums = created
      ? await this.sumsRepo.sumsByCard(command.userId, [{ id: created.id, since: currentCycleStart(account.billingCycleDay, new Date()) }])
      : [];
    const sumsMap = new Map<string, { income: string; expense: string }>();
    for (const s of sums) {
      if (!s.cardId) continue;
      const key = `${s.cardId}:${s.currency}`;
      const entry = sumsMap.get(key) ?? { income: "0", expense: "0" };
      if (s.type === "INCOME") entry.income = s.sum;
      else entry.expense = s.sum;
      sumsMap.set(key, entry);
    }
    const dto = cardToDto(created!, currency, sumsMap);
    return { result: dto, events: [] };
  }
}

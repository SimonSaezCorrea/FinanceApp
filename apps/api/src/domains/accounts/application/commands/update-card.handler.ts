import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { BankAccount, type ResolvedCardPlacement } from "../../domain/bank-account.aggregate";
import { AccountNotFoundError, CardNotFoundError } from "../../domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
  type CreateCardPlan,
} from "../../domain/ports/bank-account.repository.port";
import { cardToDto } from "../queries/account-dto.mapper";
import { UpdateCardCommand } from "./update-card.command";

interface Context {
  account: BankAccount;
  plan: CreateCardPlan;
}

@Injectable()
@CommandHandler(UpdateCardCommand)
export class UpdateCardHandler extends BaseCommandHandler<UpdateCardCommand, accounts.Card, Context> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateCardCommand): Promise<Context> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    const placement: ResolvedCardPlacement = account.resolveCardPlacement(command.input, command.cardId);
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

  protected async handle(command: UpdateCardCommand, context: Context): Promise<HandleResult<accounts.Card>> {
    if (context.plan.isPrimary) {
      await this.accountRepo.save(context.account);
    }
    const account = await this.accountRepo.updateCard(command.userId, command.accountId, command.cardId, context.plan);
    if (!account) throw new CardNotFoundError();
    const updated = account.cards.find((c) => c.id === command.cardId);
    if (!updated) throw new CardNotFoundError();
    const sums = await this.accountRepo.cardSums(command.userId, [
      { id: updated.id, billingCycleDay: account.billingCycleDay },
    ]);
    const sumsMap = new Map<string, { income: string; expense: string }>();
    for (const s of sums) {
      if (!s.cardId) continue;
      const key = `${s.cardId}:${s.currency}`;
      const entry = sumsMap.get(key) ?? { income: "0", expense: "0" };
      if (s.type === "INCOME") entry.income = s.sum;
      else entry.expense = s.sum;
      sumsMap.set(key, entry);
    }
    const dto = cardToDto(updated, account.snapshot().currency, sumsMap);
    return { result: dto, events: [] };
  }
}

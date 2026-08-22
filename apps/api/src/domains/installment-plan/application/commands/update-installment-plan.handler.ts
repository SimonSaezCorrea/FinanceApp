import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { installments } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../../card-account/domain/ports/card-account.repository.port";
import { InstallmentPlanNotFoundError } from "../../domain/errors";
import { InstallmentPlan } from "../../domain/installment-plan.aggregate";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { UpdateInstallmentPlanCommand } from "./update-installment-plan.command";

@Injectable()
@CommandHandler(UpdateInstallmentPlanCommand)
export class UpdateInstallmentPlanHandler extends BaseCommandHandler<
  UpdateInstallmentPlanCommand,
  installments.InstallmentPlan,
  InstallmentPlan
> {
  constructor(
    eventBus: EventBus,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateInstallmentPlanCommand): Promise<InstallmentPlan> {
    const plan = await this.repo.findOne(command.userId, command.id);
    if (!plan) throw new InstallmentPlanNotFoundError();
    return plan;
  }

  protected async handle(
    command: UpdateInstallmentPlanCommand,
    plan: InstallmentPlan,
  ): Promise<HandleResult<installments.InstallmentPlan>> {
    const { input } = command;
    // The card AFTER the patch decides it: changing either half — putting the plan on
    // a credit card, or naming an account to pay it from — can break INV-P2, and both
    // arrive in the same request.
    const effectiveCardId = input.cardId !== undefined ? input.cardId : plan.snapshot().cardId;
    const effectivePaymentAccountId =
      input.paymentAccountId !== undefined
        ? input.paymentAccountId
        : plan.snapshot().paymentAccountId;
    const cardKind = effectiveCardId
      ? await this.cards.kindForCard(command.userId, effectiveCardId)
      : null;
    InstallmentPlan.assertPaymentAccountAllowed(cardKind, effectivePaymentAccountId);

    plan.applyUpdate({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.frequencyInterval !== undefined
        ? { frequencyInterval: input.frequencyInterval }
        : {}),
      ...(input.cardId !== undefined ? { cardId: input.cardId } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.paymentAccountId !== undefined ? { paymentAccountId: input.paymentAccountId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    return { result: plan.toContract(), events: [] };
  }

  protected override async persist(plan: InstallmentPlan): Promise<void> {
    await this.repo.save(plan);
  }
}

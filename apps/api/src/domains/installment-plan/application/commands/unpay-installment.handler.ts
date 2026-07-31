import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InstallmentPlanNotFoundError } from "../../domain/errors";
import type { InstallmentPlan } from "../../domain/installment-plan.aggregate";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { UnpayInstallmentCommand } from "./unpay-installment.command";

interface Context {
  plan: InstallmentPlan;
  sequence: number;
}

/** Clears a scheduled payment's paid status — mirror of `PayInstallmentHandler`. */
@Injectable()
@CommandHandler(UnpayInstallmentCommand)
export class UnpayInstallmentHandler extends BaseCommandHandler<
  UnpayInstallmentCommand,
  void,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UnpayInstallmentCommand): Promise<Context> {
    const plan = await this.repo.findOne(command.userId, command.planId);
    if (!plan) throw new InstallmentPlanNotFoundError();
    return { plan, sequence: command.sequence };
  }

  protected async handle(
    _command: UnpayInstallmentCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    context.plan.markPaymentUnpaid(context.sequence);
    return { result: undefined, events: [] };
  }

  protected override async persist(context: Context): Promise<void> {
    await this.repo.setPaymentPaidAt(context.plan.userId, context.plan.id, context.sequence, null);
  }
}

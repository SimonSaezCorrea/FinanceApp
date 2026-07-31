import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InstallmentPlanNotFoundError } from "../../domain/errors";
import type { InstallmentPlan } from "../../domain/installment-plan.aggregate";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { PayInstallmentCommand } from "./pay-installment.command";

interface Context {
  plan: InstallmentPlan;
  sequence: number;
}

/**
 * Marks one scheduled payment paid — the aggregate enforces the "must exist
 * on this plan" invariant (`INSTALLMENT_PAYMENT_NOT_FOUND`, zero DB) in
 * `handle()`, then only that payment's `paidAt` is persisted
 * (`setPaymentPaidAt`), never a full-plan rewrite.
 */
@Injectable()
@CommandHandler(PayInstallmentCommand)
export class PayInstallmentHandler extends BaseCommandHandler<
  PayInstallmentCommand,
  void,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: PayInstallmentCommand): Promise<Context> {
    const plan = await this.repo.findOne(command.userId, command.planId);
    if (!plan) throw new InstallmentPlanNotFoundError();
    return { plan, sequence: command.sequence };
  }

  protected async handle(
    _command: PayInstallmentCommand,
    context: Context,
  ): Promise<HandleResult<void>> {
    context.plan.markPaymentPaid(context.sequence);
    return { result: undefined, events: [] };
  }

  protected override async persist(context: Context): Promise<void> {
    await this.repo.setPaymentPaidAt(
      context.plan.userId,
      context.plan.id,
      context.sequence,
      new Date(),
    );
  }
}

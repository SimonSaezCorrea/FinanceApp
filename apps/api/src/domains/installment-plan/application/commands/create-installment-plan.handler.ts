import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { installments } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InstallmentPlan } from "../../domain/installment-plan.aggregate";
import type { CreateInstallmentPlanPlan } from "../../domain/ports/installment-plan.repository.port";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { CreateInstallmentPlanCommand } from "./create-installment-plan.command";

interface Context {
  plan: CreateInstallmentPlanPlan;
}

/**
 * Creates a plan, generating its equal-principal payment schedule
 * (`InstallmentPlan.planCreation`) — the actual repository write happens in
 * `handle()` (same convention `accounts`' `CreateAccountHandler` uses), so
 * `persist()` stays the default no-op.
 */
@Injectable()
@CommandHandler(CreateInstallmentPlanCommand)
export class CreateInstallmentPlanHandler extends BaseCommandHandler<
  CreateInstallmentPlanCommand,
  installments.InstallmentPlan,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CreateInstallmentPlanCommand): Promise<Context> {
    const { input } = command;
    const planned = InstallmentPlan.planCreation({
      title: input.title,
      totalPrincipal: input.totalPrincipal,
      installmentCount: input.installmentCount,
      startDate: new Date(input.startDate),
      currency: input.currency,
      frequency: input.frequency,
      frequencyInterval: input.frequencyInterval,
      aprPerPeriod: input.aprPerPeriod,
      cardId: input.cardId,
      notes: input.notes,
    });
    return { plan: planned };
  }

  protected async handle(
    command: CreateInstallmentPlanCommand,
    context: Context,
  ): Promise<HandleResult<installments.InstallmentPlan>> {
    const row = await this.repo.create(command.userId, context.plan);
    return { result: row.toContract(), events: [] };
  }
}

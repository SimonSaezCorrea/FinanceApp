import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { installments } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InstallmentPlanNotFoundError } from "../../domain/errors";
import type { InstallmentPlan } from "../../domain/installment-plan.aggregate";
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
    plan.applyUpdate({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.frequencyInterval !== undefined
        ? { frequencyInterval: input.frequencyInterval }
        : {}),
      ...(input.cardId !== undefined ? { cardId: input.cardId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    return { result: plan.toContract(), events: [] };
  }

  protected override async persist(plan: InstallmentPlan): Promise<void> {
    await this.repo.save(plan);
  }
}

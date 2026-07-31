import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InstallmentPlanNotFoundError } from "../../domain/errors";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../domain/ports/installment-plan.repository.port";
import { RemoveInstallmentPlanCommand } from "./remove-installment-plan.command";

@Injectable()
@CommandHandler(RemoveInstallmentPlanCommand)
export class RemoveInstallmentPlanHandler extends BaseCommandHandler<
  RemoveInstallmentPlanCommand,
  void,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly repo: InstallmentPlanRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RemoveInstallmentPlanCommand): Promise<HandleResult<void>> {
    const ok = await this.repo.remove(command.userId, command.id);
    if (!ok) throw new InstallmentPlanNotFoundError();
    return { result: undefined, events: [] };
  }
}

import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { SavingsGoalNotFoundError } from "../../domain/errors";
import {
  SAVINGS_GOAL_REPOSITORY,
  type SavingsGoalRepositoryPort,
} from "../../domain/ports/savings-goal.repository.port";
import { RemoveSavingsGoalCommand } from "./remove-savings-goal.command";

@Injectable()
@CommandHandler(RemoveSavingsGoalCommand)
export class RemoveSavingsGoalHandler extends BaseCommandHandler<RemoveSavingsGoalCommand, void, null> {
  constructor(
    eventBus: EventBus,
    @Inject(SAVINGS_GOAL_REPOSITORY) private readonly repo: SavingsGoalRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RemoveSavingsGoalCommand): Promise<HandleResult<void>> {
    const ok = await this.repo.remove(command.userId, command.id);
    if (!ok) throw new SavingsGoalNotFoundError();
    return { result: undefined, events: [] };
  }
}

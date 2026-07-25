import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { DebtNotFoundError } from "../../domain/errors";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { RemoveDebtCommand } from "./remove-debt.command";

@Injectable()
@CommandHandler(RemoveDebtCommand)
export class RemoveDebtHandler extends BaseCommandHandler<RemoveDebtCommand, void, null> {
  constructor(
    eventBus: EventBus,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RemoveDebtCommand): Promise<HandleResult<void>> {
    const ok = await this.repo.remove(command.userId, command.id);
    if (!ok) throw new DebtNotFoundError();
    return { result: undefined, events: [] };
  }
}

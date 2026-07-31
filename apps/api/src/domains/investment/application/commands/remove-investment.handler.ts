import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InvestmentNotFoundError } from "../../domain/errors";
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepositoryPort,
} from "../../domain/ports/investment.repository.port";
import { RemoveInvestmentCommand } from "./remove-investment.command";

@Injectable()
@CommandHandler(RemoveInvestmentCommand)
export class RemoveInvestmentHandler extends BaseCommandHandler<RemoveInvestmentCommand, void, null> {
  constructor(
    eventBus: EventBus,
    @Inject(INVESTMENT_REPOSITORY) private readonly repo: InvestmentRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RemoveInvestmentCommand): Promise<HandleResult<void>> {
    const ok = await this.repo.remove(command.userId, command.id);
    if (!ok) throw new InvestmentNotFoundError();
    return { result: undefined, events: [] };
  }
}

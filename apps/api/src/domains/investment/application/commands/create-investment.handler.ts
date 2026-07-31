import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { investments } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { Investment } from "../../domain/investment.aggregate";
import type { PlannedInvestment } from "../../domain/investment.aggregate";
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepositoryPort,
} from "../../domain/ports/investment.repository.port";
import { CreateInvestmentCommand } from "./create-investment.command";

interface Context {
  plan: PlannedInvestment;
}

/**
 * Creates an investment — the actual repository write happens in `handle()`
 * (same convention `debts`' `CreateDebtHandler` uses), so `persist()` stays
 * the default no-op.
 */
@Injectable()
@CommandHandler(CreateInvestmentCommand)
export class CreateInvestmentHandler extends BaseCommandHandler<
  CreateInvestmentCommand,
  investments.Investment,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(INVESTMENT_REPOSITORY) private readonly repo: InvestmentRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CreateInvestmentCommand): Promise<Context> {
    const { input } = command;
    const plan = Investment.planCreation({
      kind: input.kind,
      label: input.label,
      currency: input.currency,
      symbol: input.symbol,
      shares: input.shares,
      annualRate: input.annualRate,
      principal: input.principal,
      bankAccountId: input.bankAccountId,
      openedAt: input.openedAt ? new Date(input.openedAt) : undefined,
    });
    return { plan };
  }

  protected async handle(
    command: CreateInvestmentCommand,
    context: Context,
  ): Promise<HandleResult<investments.Investment>> {
    const investment = await this.repo.create(command.userId, context.plan);
    return { result: investment.toContract(), events: [] };
  }
}

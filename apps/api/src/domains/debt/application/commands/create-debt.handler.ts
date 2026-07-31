import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { debts } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { Debt } from "../../domain/debt.aggregate";
import type { PlannedDebt } from "../../domain/debt.aggregate";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { CreateDebtCommand } from "./create-debt.command";

interface Context {
  plan: PlannedDebt;
}

/**
 * Creates a debt — the actual repository write happens in `handle()` (same
 * convention `installments`' `CreateInstallmentPlanHandler` uses), so
 * `persist()` stays the default no-op.
 */
@Injectable()
@CommandHandler(CreateDebtCommand)
export class CreateDebtHandler extends BaseCommandHandler<CreateDebtCommand, debts.Debt, Context> {
  constructor(
    eventBus: EventBus,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: CreateDebtCommand): Promise<Context> {
    const { input } = command;
    const plan = Debt.planCreation({
      direction: input.direction,
      counterparty: input.counterparty,
      principal: input.principal,
      currency: input.currency,
      openedAt: new Date(input.openedAt),
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      interestApr: input.interestApr,
      notes: input.notes,
      totalInstallments: input.totalInstallments,
      installmentAmount: input.installmentAmount,
      frequency: input.frequency,
      frequencyInterval: input.frequencyInterval,
    });
    return { plan };
  }

  protected async handle(
    command: CreateDebtCommand,
    context: Context,
  ): Promise<HandleResult<debts.Debt>> {
    const debt = await this.repo.create(command.userId, context.plan);
    return { result: debt.toContract(), events: [] };
  }
}

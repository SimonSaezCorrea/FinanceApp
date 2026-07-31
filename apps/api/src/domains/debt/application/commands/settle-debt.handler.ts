import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { DebtNotFoundError } from "../../domain/errors";
import type { Debt } from "../../domain/debt.aggregate";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { SettleDebtCommand } from "./settle-debt.command";

/** Marks a debt settled directly — no guard, mirrors the pre-migration
 * `DebtsService.settle` (never checked prior state). */
@Injectable()
@CommandHandler(SettleDebtCommand)
export class SettleDebtHandler extends BaseCommandHandler<SettleDebtCommand, void, Debt> {
  constructor(
    eventBus: EventBus,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: SettleDebtCommand): Promise<Debt> {
    const debt = await this.repo.findOne(command.userId, command.id);
    if (!debt) throw new DebtNotFoundError();
    return debt;
  }

  protected async handle(_command: SettleDebtCommand, debt: Debt): Promise<HandleResult<void>> {
    debt.settle();
    return { result: undefined, events: [] };
  }

  protected override async persist(debt: Debt): Promise<void> {
    await this.repo.save(debt);
  }
}

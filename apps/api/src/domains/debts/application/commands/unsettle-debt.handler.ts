import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { debts } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { DebtNotFoundError } from "../../domain/errors";
import type { Debt } from "../../domain/debt.aggregate";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { UnsettleDebtCommand } from "./unsettle-debt.command";

/** Reverts a settled debt back to open — the aggregate enforces
 * `DEBT_NOT_SETTLED` when it wasn't settled to begin with. */
@Injectable()
@CommandHandler(UnsettleDebtCommand)
export class UnsettleDebtHandler extends BaseCommandHandler<UnsettleDebtCommand, debts.Debt, Debt> {
  constructor(
    eventBus: EventBus,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UnsettleDebtCommand): Promise<Debt> {
    const debt = await this.repo.findOne(command.userId, command.id);
    if (!debt) throw new DebtNotFoundError();
    return debt;
  }

  protected async handle(_command: UnsettleDebtCommand, debt: Debt): Promise<HandleResult<debts.Debt>> {
    debt.unsettle();
    return { result: debt.toContract(), events: [] };
  }

  protected override async persist(debt: Debt): Promise<void> {
    await this.repo.save(debt);
  }
}

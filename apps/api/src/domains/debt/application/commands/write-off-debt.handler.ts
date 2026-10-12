import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { debts } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import type { Debt } from "../../domain/debt.aggregate";
import { DebtNotFoundError } from "../../domain/errors";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { WriteOffDebtCommand } from "./write-off-debt.command";

/**
 * Gives up on a debt ("no se pagará") or takes it back. Moves no money: the
 * payments already made stay where they are, only what was still pending stops
 * counting. Retry-safe by its states (Principle VII form (a)): writing off a
 * debt already written off answers `DEBT_WRITTEN_OFF`, reinstating one that
 * isn't answers `DEBT_NOT_WRITTEN_OFF`, and nothing changes either way.
 */
@Injectable()
@CommandHandler(WriteOffDebtCommand)
export class WriteOffDebtHandler extends BaseCommandHandler<WriteOffDebtCommand, debts.Debt, Debt> {
  constructor(
    eventBus: EventBus,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: WriteOffDebtCommand): Promise<Debt> {
    const debt = await this.repo.findOne(command.userId, command.id);
    if (!debt) throw new DebtNotFoundError();
    return debt;
  }

  protected async handle(
    command: WriteOffDebtCommand,
    debt: Debt,
  ): Promise<HandleResult<debts.Debt>> {
    if (command.writtenOff) debt.writeOff();
    else debt.reinstate();
    return { result: debt.toContract(), events: [] };
  }

  protected override async persist(debt: Debt): Promise<void> {
    await this.repo.save(debt);
  }
}

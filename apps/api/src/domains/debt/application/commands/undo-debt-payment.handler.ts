import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { debts } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { DebtNotFoundError } from "../../domain/errors";
import type { Debt } from "../../domain/debt.aggregate";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { UndoDebtPaymentCommand } from "./undo-debt-payment.command";

/** Reverts the most recently registered payment — `NO_PAYMENTS_TO_UNDO` if
 * none were registered; clears `settledAt` if the undone payment had
 * settled it. */
@Injectable()
@CommandHandler(UndoDebtPaymentCommand)
export class UndoDebtPaymentHandler extends BaseCommandHandler<
  UndoDebtPaymentCommand,
  debts.Debt,
  Debt
> {
  constructor(
    eventBus: EventBus,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UndoDebtPaymentCommand): Promise<Debt> {
    const debt = await this.repo.findOne(command.userId, command.id);
    if (!debt) throw new DebtNotFoundError();
    return debt;
  }

  protected async handle(
    _command: UndoDebtPaymentCommand,
    debt: Debt,
  ): Promise<HandleResult<debts.Debt>> {
    debt.undoPayment();
    return { result: debt.toContract(), events: [] };
  }

  protected override async persist(debt: Debt): Promise<void> {
    await this.repo.save(debt);
  }
}

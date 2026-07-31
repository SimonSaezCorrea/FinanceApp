import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { debts } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { DebtNotFoundError } from "../../domain/errors";
import type { Debt } from "../../domain/debt.aggregate";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { RegisterDebtPaymentCommand } from "./register-debt-payment.command";

/** Registers one more paid installment — the aggregate enforces
 * `DEBT_ALREADY_SETTLED`/`ALL_INSTALLMENTS_PAID` and auto-settles once the
 * schedule completes. */
@Injectable()
@CommandHandler(RegisterDebtPaymentCommand)
export class RegisterDebtPaymentHandler extends BaseCommandHandler<
  RegisterDebtPaymentCommand,
  debts.Debt,
  Debt
> {
  constructor(
    eventBus: EventBus,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RegisterDebtPaymentCommand): Promise<Debt> {
    const debt = await this.repo.findOne(command.userId, command.id);
    if (!debt) throw new DebtNotFoundError();
    return debt;
  }

  protected async handle(
    _command: RegisterDebtPaymentCommand,
    debt: Debt,
  ): Promise<HandleResult<debts.Debt>> {
    debt.registerPayment();
    return { result: debt.toContract(), events: [] };
  }

  protected override async persist(debt: Debt): Promise<void> {
    await this.repo.save(debt);
  }
}

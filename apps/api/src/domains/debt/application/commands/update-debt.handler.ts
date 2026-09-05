import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { debts } from "@finance/contracts";

import {
  BANK_ACCOUNT_LOOKUP,
  type BankAccountLookupPort,
} from "../../../bank-account/domain/ports/bank-account-lookup.port";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { DebtNotFoundError } from "../../domain/errors";
import type { Debt } from "../../domain/debt.aggregate";
import { DEBT_REPOSITORY, type DebtRepositoryPort } from "../../domain/ports/debt.repository.port";
import { UpdateDebtCommand } from "./update-debt.command";

@Injectable()
@CommandHandler(UpdateDebtCommand)
export class UpdateDebtHandler extends BaseCommandHandler<UpdateDebtCommand, debts.Debt, Debt> {
  constructor(
    eventBus: EventBus,
    @Inject(DEBT_REPOSITORY) private readonly repo: DebtRepositoryPort,
    @Inject(BANK_ACCOUNT_LOOKUP) private readonly accounts: BankAccountLookupPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateDebtCommand): Promise<Debt> {
    const debt = await this.repo.findOne(command.userId, command.id);
    if (!debt) throw new DebtNotFoundError();
    if (
      command.input.paymentAccountId &&
      !(await this.accounts.accountOwned(command.userId, command.input.paymentAccountId))
    ) {
      throw new AccountNotFoundError();
    }
    return debt;
  }

  protected async handle(
    command: UpdateDebtCommand,
    debt: Debt,
  ): Promise<HandleResult<debts.Debt>> {
    const { input } = command;
    debt.applyUpdate({
      ...(input.direction !== undefined ? { direction: input.direction } : {}),
      ...(input.counterparty !== undefined ? { counterparty: input.counterparty } : {}),
      ...(input.principal !== undefined ? { principal: input.principal } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.openedAt !== undefined ? { openedAt: new Date(input.openedAt) } : {}),
      ...(input.dueAt !== undefined ? { dueAt: new Date(input.dueAt) } : {}),
      ...(input.interestApr !== undefined ? { interestApr: input.interestApr } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.totalInstallments !== undefined
        ? { totalInstallments: input.totalInstallments }
        : {}),
      ...(input.installmentAmount !== undefined
        ? { installmentAmount: input.installmentAmount }
        : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.frequencyInterval !== undefined
        ? { frequencyInterval: input.frequencyInterval }
        : {}),
      ...(input.paymentAccountId !== undefined ? { paymentAccountId: input.paymentAccountId } : {}),
    });
    return { result: debt.toContract(), events: [] };
  }

  protected override async persist(debt: Debt): Promise<void> {
    await this.repo.save(debt);
  }
}

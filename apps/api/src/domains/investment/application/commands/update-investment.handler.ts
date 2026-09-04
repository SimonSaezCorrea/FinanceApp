import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { investments } from "@finance/contracts";

import {
  BANK_ACCOUNT_LOOKUP,
  type BankAccountLookupPort,
} from "../../../bank-account/domain/ports/bank-account-lookup.port";
import { AccountNotFoundError } from "../../../bank-account/domain/errors";
import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { InvestmentNotFoundError } from "../../domain/errors";
import type { Investment } from "../../domain/investment.aggregate";
import {
  INVESTMENT_REPOSITORY,
  type InvestmentRepositoryPort,
} from "../../domain/ports/investment.repository.port";
import { UpdateInvestmentCommand } from "./update-investment.command";

@Injectable()
@CommandHandler(UpdateInvestmentCommand)
export class UpdateInvestmentHandler extends BaseCommandHandler<
  UpdateInvestmentCommand,
  investments.Investment,
  Investment
> {
  constructor(
    eventBus: EventBus,
    @Inject(INVESTMENT_REPOSITORY) private readonly repo: InvestmentRepositoryPort,
    @Inject(BANK_ACCOUNT_LOOKUP) private readonly accounts: BankAccountLookupPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateInvestmentCommand): Promise<Investment> {
    const investment = await this.repo.findOne(command.userId, command.id);
    if (!investment) throw new InvestmentNotFoundError();
    if (
      command.input.bankAccountId &&
      !(await this.accounts.accountOwned(command.userId, command.input.bankAccountId))
    ) {
      throw new AccountNotFoundError();
    }
    return investment;
  }

  protected async handle(
    command: UpdateInvestmentCommand,
    investment: Investment,
  ): Promise<HandleResult<investments.Investment>> {
    const { input } = command;
    investment.applyUpdate({
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
      ...(input.shares !== undefined ? { shares: input.shares } : {}),
      ...(input.annualRate !== undefined ? { annualRate: input.annualRate } : {}),
      ...(input.principal !== undefined ? { principal: input.principal } : {}),
      ...(input.bankAccountId !== undefined ? { bankAccountId: input.bankAccountId } : {}),
      ...(input.openedAt !== undefined ? { openedAt: new Date(input.openedAt) } : {}),
    });
    return { result: investment.toContract(), events: [] };
  }

  protected override async persist(investment: Investment): Promise<void> {
    await this.repo.save(investment);
  }
}

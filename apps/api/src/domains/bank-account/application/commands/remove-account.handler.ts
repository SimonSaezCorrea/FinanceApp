import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { AccountNotFoundError, CashAccountRequiredError } from "../../domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { RemoveAccountCommand } from "./remove-account.command";

@Injectable()
@CommandHandler(RemoveAccountCommand)
export class RemoveAccountHandler extends BaseCommandHandler<RemoveAccountCommand, void, null> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RemoveAccountCommand): Promise<HandleResult<void>> {
    const account = await this.accountRepo.findById(command.userId, command.accountId);
    if (!account) throw new AccountNotFoundError();
    // Cash is the one account that exists whether the app models it or not: every
    // user always keeps one, so the LAST one can't be deleted. A second cash
    // account (a wallet, a stash at home) still can.
    if (
      account.type === "CASH" &&
      (await this.accountRepo.countByType(command.userId, "CASH")) <= 1
    ) {
      throw new CashAccountRequiredError();
    }
    const ok = await this.accountRepo.remove(command.userId, command.accountId);
    if (!ok) throw new AccountNotFoundError();
    return { result: undefined, events: [] };
  }
}

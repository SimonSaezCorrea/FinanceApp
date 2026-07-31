import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { AccountNotFoundError } from "../../domain/errors";
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
    const ok = await this.accountRepo.remove(command.userId, command.accountId);
    if (!ok) throw new AccountNotFoundError();
    return { result: undefined, events: [] };
  }
}

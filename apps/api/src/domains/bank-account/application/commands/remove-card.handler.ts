import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { CardNotFoundError } from "../../domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { RemoveCardCommand } from "./remove-card.command";

@Injectable()
@CommandHandler(RemoveCardCommand)
export class RemoveCardHandler extends BaseCommandHandler<RemoveCardCommand, void, null> {
  constructor(
    eventBus: EventBus,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RemoveCardCommand): Promise<HandleResult<void>> {
    const ok = await this.accountRepo.removeCard(command.userId, command.accountId, command.cardId);
    if (!ok) throw new CardNotFoundError();
    return { result: undefined, events: [] };
  }
}

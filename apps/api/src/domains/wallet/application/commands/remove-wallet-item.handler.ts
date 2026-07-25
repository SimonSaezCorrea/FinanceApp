import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { WalletItemNotFoundError } from "../../domain/errors";
import {
  WALLET_ITEM_REPOSITORY,
  type WalletItemRepositoryPort,
} from "../../domain/ports/wallet-item.repository.port";
import { RemoveWalletItemCommand } from "./remove-wallet-item.command";

@Injectable()
@CommandHandler(RemoveWalletItemCommand)
export class RemoveWalletItemHandler extends BaseCommandHandler<RemoveWalletItemCommand, void, null> {
  constructor(
    eventBus: EventBus,
    @Inject(WALLET_ITEM_REPOSITORY) private readonly repo: WalletItemRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RemoveWalletItemCommand): Promise<HandleResult<void>> {
    const ok = await this.repo.remove(command.userId, command.id);
    if (!ok) throw new WalletItemNotFoundError();
    return { result: undefined, events: [] };
  }
}

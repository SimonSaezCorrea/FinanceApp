import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { wallet } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  WALLET_ITEM_REPOSITORY,
  type WalletItemRepositoryPort,
} from "../../domain/ports/wallet-item.repository.port";
import { ReorderWalletCommand } from "./reorder-wallet.command";

@Injectable()
@CommandHandler(ReorderWalletCommand)
export class ReorderWalletHandler extends BaseCommandHandler<
  ReorderWalletCommand,
  wallet.WalletItem[],
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(WALLET_ITEM_REPOSITORY) private readonly repo: WalletItemRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(
    command: ReorderWalletCommand,
  ): Promise<HandleResult<wallet.WalletItem[]>> {
    await this.repo.reorder(command.userId, command.ids);
    const rows = await this.repo.list(command.userId);
    return { result: rows.map((r) => r.toContract()), events: [] };
  }
}

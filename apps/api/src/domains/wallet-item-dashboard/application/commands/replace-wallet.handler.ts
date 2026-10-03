import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { wallet } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  WalletAccountNotFoundError,
  WalletCardNotFoundError,
  WalletFullError,
} from "../../domain/errors";
import {
  WALLET_ITEM_REPOSITORY,
  type WalletItemRepositoryPort,
} from "../../domain/ports/wallet-item.repository.port";
import { WalletItem, type PlannedWalletItem } from "../../domain/wallet-item.aggregate";
import { ReplaceWalletCommand } from "./replace-wallet.command";

interface Context {
  plans: PlannedWalletItem[];
}

/**
 * Replaces the whole wallet at once, in the order given — what the "Arma tu
 * cartera" panel saves after the user picks, removes and reorders its entries.
 * Every account/card must be the user's (Principle II) and there can be at most
 * `WALLET_MAX_ITEMS`. Retry safety (Principle VII): the result is a function of
 * the body alone, so sending it twice leaves the same wallet.
 */
@Injectable()
@CommandHandler(ReplaceWalletCommand)
export class ReplaceWalletHandler extends BaseCommandHandler<
  ReplaceWalletCommand,
  wallet.WalletItem[],
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(WALLET_ITEM_REPOSITORY) private readonly repo: WalletItemRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: ReplaceWalletCommand): Promise<Context> {
    const { userId, items } = command;
    if (items.length > wallet.WALLET_MAX_ITEMS) throw new WalletFullError();
    for (const item of items) {
      if (item.accountId && !(await this.repo.accountOwned(userId, item.accountId))) {
        throw new WalletAccountNotFoundError();
      }
      if (item.cardId && !(await this.repo.cardOwned(userId, item.cardId))) {
        throw new WalletCardNotFoundError();
      }
    }
    const plans = items.map((item, order) =>
      WalletItem.planCreation({ accountId: item.accountId, cardId: item.cardId, order }),
    );
    return { plans };
  }

  protected async handle(
    command: ReplaceWalletCommand,
    context: Context,
  ): Promise<HandleResult<wallet.WalletItem[]>> {
    const items = await this.repo.replace(command.userId, context.plans);
    return { result: items.map((i) => i.toContract()), events: [] };
  }
}

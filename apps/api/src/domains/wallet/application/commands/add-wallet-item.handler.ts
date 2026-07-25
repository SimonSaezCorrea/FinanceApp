import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { wallet } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { WalletItem, type PlannedWalletItem } from "../../domain/wallet-item.aggregate";
import { WalletAccountNotFoundError, WalletCardNotFoundError, WalletItemExistsError } from "../../domain/errors";
import {
  WALLET_ITEM_REPOSITORY,
  type WalletItemRepositoryPort,
} from "../../domain/ports/wallet-item.repository.port";
import { AddWalletItemCommand } from "./add-wallet-item.command";

interface Context {
  plan: PlannedWalletItem;
}

/**
 * Pins an account or card to the dashboard wallet — the actual repository
 * write happens in `handle()` (same convention `savings`'
 * `CreateSavingsGoalHandler` uses), so `persist()` stays the default no-op.
 */
@Injectable()
@CommandHandler(AddWalletItemCommand)
export class AddWalletItemHandler extends BaseCommandHandler<AddWalletItemCommand, wallet.WalletItem, Context> {
  constructor(
    eventBus: EventBus,
    @Inject(WALLET_ITEM_REPOSITORY) private readonly repo: WalletItemRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: AddWalletItemCommand): Promise<Context> {
    const { userId, input } = command;

    // The referenced card/account must belong to the user.
    if (input.accountId) {
      if (!(await this.repo.accountOwned(userId, input.accountId))) throw new WalletAccountNotFoundError();
    } else if (input.cardId) {
      if (!(await this.repo.cardOwned(userId, input.cardId))) throw new WalletCardNotFoundError();
    }
    if (await this.repo.existing(userId, input.accountId, input.cardId)) throw new WalletItemExistsError();

    const order = await this.repo.count(userId);
    const plan = WalletItem.planCreation({ accountId: input.accountId, cardId: input.cardId, order });
    return { plan };
  }

  protected async handle(
    command: AddWalletItemCommand,
    context: Context,
  ): Promise<HandleResult<wallet.WalletItem>> {
    const item = await this.repo.create(command.userId, context.plan);
    return { result: item.toContract(), events: [] };
  }
}

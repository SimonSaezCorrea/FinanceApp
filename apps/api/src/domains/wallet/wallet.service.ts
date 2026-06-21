import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { WalletItem as WalletItemRow } from "@prisma/client";

import { wallet } from "@finance/contracts";

import { WalletRepository } from "./wallet.repository";

@Injectable()
export class WalletService {
  constructor(private readonly repo: WalletRepository) {}

  async list(userId: string): Promise<wallet.WalletItem[]> {
    const rows = await this.repo.list(userId);
    return rows.map(toContract);
  }

  async add(userId: string, input: wallet.CreateWalletItem): Promise<wallet.WalletItem> {
    // The referenced card/account must belong to the user.
    if (input.accountId) {
      if (!(await this.repo.accountOwned(userId, input.accountId)))
        throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    } else if (input.cardId) {
      if (!(await this.repo.cardOwned(userId, input.cardId)))
        throw new NotFoundException({ code: "CARD_NOT_FOUND" });
    }
    if (await this.repo.existing(userId, input.accountId, input.cardId))
      throw new ConflictException({ code: "WALLET_ITEM_EXISTS" });

    const order = await this.repo.count(userId);
    const row = await this.repo.create(userId, {
      accountId: input.accountId,
      cardId: input.cardId,
      order,
    });
    return toContract(row);
  }

  async reorder(userId: string, ids: string[]): Promise<wallet.WalletItem[]> {
    await this.repo.reorder(userId, ids);
    return this.list(userId);
  }

  async remove(userId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(userId, id);
    if (!ok) throw new NotFoundException({ code: "WALLET_ITEM_NOT_FOUND" });
  }
}

function toContract(row: WalletItemRow): wallet.WalletItem {
  return {
    id: row.id,
    accountId: row.accountId,
    cardId: row.cardId,
    order: row.order,
    createdAt: row.createdAt.toISOString(),
  };
}

import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { wallet } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  WALLET_ITEM_REPOSITORY,
  type WalletItemRepositoryPort,
} from "../../domain/ports/wallet-item.repository.port";
import { ListWalletQuery } from "./list-wallet.query";

@Injectable()
@QueryHandler(ListWalletQuery)
export class ListWalletQueryHandler extends BaseQueryHandler<ListWalletQuery, wallet.WalletItem[], string> {
  constructor(@Inject(WALLET_ITEM_REPOSITORY) private readonly repo: WalletItemRepositoryPort) {
    super();
  }

  protected async loadContext(query: ListWalletQuery): Promise<string> {
    return query.userId;
  }

  protected async handle(_query: ListWalletQuery, userId: string): Promise<wallet.WalletItem[]> {
    const rows = await this.repo.list(userId);
    return rows.map((r) => r.toContract());
  }
}

import { Inject, Injectable } from "@nestjs/common";
import type { WalletItemDashboard as WalletItemRow } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../bank-account/domain/ports/bank-account.repository.port";
import {
  CARD_ACCOUNT_REPOSITORY,
  type CardAccountRepositoryPort,
} from "../../card-account/domain/ports/card-account.repository.port";
import { WalletItem, type PlannedWalletItem, type WalletItemProps } from "../domain/wallet-item.aggregate";
import type { WalletItemRepositoryPort } from "../domain/ports/wallet-item.repository.port";

function rowToProps(row: WalletItemRow): WalletItemProps {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    cardId: row.cardId,
    order: row.order,
    createdAt: row.createdAt,
  };
}

/** Adapter (FR-011) — the only file in `wallet` allowed to import
 * `@prisma/client`. All access scoped by `userId` (Constitution Principle II). */
@Injectable()
export class PrismaWalletItemRepository implements WalletItemRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(CARD_ACCOUNT_REPOSITORY) private readonly cards: CardAccountRepositoryPort,
  ) {}

  async list(userId: string): Promise<WalletItem[]> {
    const rows = await this.prisma.walletItemDashboard.findMany({
      where: { userId },
      orderBy: { order: "asc" },
    });
    return rows.map((r) => WalletItem.fromPersistence(rowToProps(r)));
  }

  count(userId: string): Promise<number> {
    return this.prisma.walletItemDashboard.count({ where: { userId } });
  }

  async accountOwned(userId: string, accountId: string): Promise<boolean> {
    return (await this.accounts.findById(userId, accountId)) !== null;
  }

  async cardOwned(userId: string, cardId: string): Promise<boolean> {
    return this.cards.existsForUser(userId, cardId);
  }

  async existing(userId: string, accountId?: string, cardId?: string): Promise<boolean> {
    const found = await this.prisma.walletItemDashboard.findFirst({
      where: { userId, ...(accountId ? { accountId } : {}), ...(cardId ? { cardId } : {}) },
    });
    return found !== null;
  }

  async create(userId: string, plan: PlannedWalletItem): Promise<WalletItem> {
    const row = await this.prisma.walletItemDashboard.create({
      data: {
        userId,
        order: plan.order,
        accountId: plan.accountId,
        cardId: plan.cardId,
      },
    });
    return WalletItem.fromPersistence(rowToProps(row));
  }

  async reorder(userId: string, ids: string[]): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.walletItemDashboard.updateMany({
          where: { id, userId },
          data: { order: index },
        }),
      ),
    );
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.walletItemDashboard.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}

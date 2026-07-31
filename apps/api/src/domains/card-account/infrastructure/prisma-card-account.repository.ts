import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  CARD_LIMIT_REPOSITORY,
  type CardLimitRepositoryPort,
} from "../../card-limit/domain/ports/card-limit.repository.port";
import type { CardPlan, CardProps } from "../domain/card-account.entity";
import type { CardAccountRepositoryPort } from "../domain/ports/card-account.repository.port";

type Row = {
  id: string;
  accountId: string;
  name: string;
  kind: "CREDIT" | "DEBIT" | "PREPAID";
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isActive: boolean;
  isPrimary: boolean;
};

/** Adapter — the ONLY file that touches `prisma.cardAccount`. Limit rows are
 * delegated to the `card-limit` domain's own port. */
@Injectable()
export class PrismaCardAccountRepository implements CardAccountRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CARD_LIMIT_REPOSITORY) private readonly limits: CardLimitRepositoryPort,
  ) {}

  private async hydrate(rows: Row[]): Promise<(CardProps & { accountId: string })[]> {
    const limitRows = await this.limits.listByCards(rows.map((r) => r.id));
    return rows.map((r) => ({
      accountId: r.accountId,
      id: r.id,
      name: r.name,
      kind: r.kind,
      last4: r.last4,
      expiryMonth: r.expiryMonth,
      expiryYear: r.expiryYear,
      isActive: r.isActive,
      isPrimary: r.isPrimary,
      limits: limitRows
        .filter((l) => l.cardId === r.id)
        .map(({ cardId: _cardId, ...limit }) => limit),
    }));
  }

  async listByAccounts(accountIds: string[]): Promise<(CardProps & { accountId: string })[]> {
    if (accountIds.length === 0) return [];
    const rows = await this.prisma.cardAccount.findMany({
      where: { accountId: { in: accountIds } },
      orderBy: { createdAt: "asc" },
    });
    return this.hydrate(rows);
  }

  async findOnAccount(userId: string, accountId: string, cardId: string): Promise<CardProps | null> {
    const row = await this.prisma.cardAccount.findFirst({ where: { id: cardId, accountId, userId } });
    if (!row) return null;
    const [card] = await this.hydrate([row]);
    return card ?? null;
  }

  async existsForUser(userId: string, cardId: string): Promise<boolean> {
    const row = await this.prisma.cardAccount.findFirst({ where: { id: cardId, userId }, select: { id: true } });
    return row !== null;
  }

  async create(userId: string, accountId: string, plan: CardPlan): Promise<string> {
    const row = await this.prisma.cardAccount.create({
      data: {
        userId,
        accountId,
        name: plan.name,
        kind: plan.kind,
        last4: plan.last4,
        expiryMonth: plan.expiryMonth,
        expiryYear: plan.expiryYear,
        isActive: plan.isActive,
        isPrimary: plan.isPrimary,
      },
      select: { id: true },
    });
    await this.limits.createForCard(row.id, plan.limits);
    return row.id;
  }

  async update(cardId: string, plan: CardPlan): Promise<void> {
    await this.prisma.cardAccount.update({
      where: { id: cardId },
      data: {
        name: plan.name,
        kind: plan.kind,
        last4: plan.last4,
        expiryMonth: plan.expiryMonth,
        expiryYear: plan.expiryYear,
        isActive: plan.isActive,
        isPrimary: plan.isPrimary,
      },
    });
    await this.limits.replaceForCard(cardId, plan.limits);
  }

  async remove(userId: string, accountId: string, cardId: string): Promise<boolean> {
    const result = await this.prisma.cardAccount.deleteMany({ where: { id: cardId, accountId, userId } });
    return result.count > 0;
  }
}

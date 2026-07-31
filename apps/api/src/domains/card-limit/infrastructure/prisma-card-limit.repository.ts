import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { CardLimitPlan, CardLimitProps } from "../domain/card-limit.entity";
import type { CardLimitRepositoryPort } from "../domain/ports/card-limit.repository.port";

/** Adapter — the ONLY file that touches `prisma.cardLimit`. */
@Injectable()
export class PrismaCardLimitRepository implements CardLimitRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listByCards(cardIds: string[]): Promise<(CardLimitProps & { cardId: string })[]> {
    if (cardIds.length === 0) return [];
    const rows = await this.prisma.cardLimit.findMany({ where: { cardId: { in: cardIds } } });
    return rows.map((l) => ({
      cardId: l.cardId,
      id: l.id,
      currency: l.currency,
      limitAmount: l.limitAmount.toString(),
      usedInitial: l.usedInitial.toString(),
    }));
  }

  async findForCardCurrency(userId: string, cardId: string, currency: string): Promise<CardLimitProps | null> {
    const row = await this.prisma.cardLimit.findFirst({ where: { currency, card: { id: cardId, userId } } });
    return row
      ? {
          id: row.id,
          currency: row.currency,
          limitAmount: row.limitAmount.toString(),
          usedInitial: row.usedInitial.toString(),
        }
      : null;
  }

  async createForCard(cardId: string, limits: CardLimitPlan[]): Promise<void> {
    if (limits.length === 0) return;
    await this.prisma.cardLimit.createMany({ data: limits.map((l) => ({ ...l, cardId })) });
  }

  async replaceForCard(cardId: string, limits: CardLimitPlan[]): Promise<void> {
    await this.prisma.cardLimit.deleteMany({ where: { cardId } });
    await this.createForCard(cardId, limits);
  }
}

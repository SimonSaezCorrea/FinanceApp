import { Injectable, NotFoundException } from "@nestjs/common";
import type { Card as CardRow, CardLimit as CardLimitRow } from "@prisma/client";

import { accounts } from "@finance/contracts";
import { moneyToString } from "@finance/money";

import { CardsRepository } from "./cards.repository";

type CardWithLimits = CardRow & { limits: CardLimitRow[] };

@Injectable()
export class CardsService {
  constructor(private readonly repo: CardsRepository) {}

  private limitsFor(input: accounts.CreateCard) {
    // DEBIT cards never carry limits (contract also enforces this).
    if (input.kind !== "CREDIT") return [];
    return (input.limits ?? []).map((l) => ({
      currency: l.currency,
      limit: l.limit,
      used: l.used,
    }));
  }

  async create(
    userId: string,
    accountId: string,
    input: accounts.CreateCard,
  ): Promise<accounts.Card> {
    const account = await this.repo.accountExists(userId, accountId);
    if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    const row = await this.repo.create(
      userId,
      accountId,
      {
        name: input.name,
        kind: input.kind,
        last4: input.last4,
        expiryMonth: input.expiryMonth,
        expiryYear: input.expiryYear,
      },
      this.limitsFor(input),
    );
    return toContract(row);
  }

  async update(
    userId: string,
    accountId: string,
    cardId: string,
    input: accounts.CreateCard,
  ): Promise<accounts.Card> {
    const row = await this.repo.update(
      userId,
      accountId,
      cardId,
      {
        name: input.name,
        kind: input.kind,
        last4: input.last4,
        expiryMonth: input.expiryMonth,
        expiryYear: input.expiryYear,
      },
      this.limitsFor(input),
    );
    if (!row) throw new NotFoundException({ code: "CARD_NOT_FOUND" });
    return toContract(row as CardWithLimits);
  }

  async remove(userId: string, accountId: string, cardId: string): Promise<void> {
    const ok = await this.repo.remove(userId, accountId, cardId);
    if (!ok) throw new NotFoundException({ code: "CARD_NOT_FOUND" });
  }
}

export function toContract(row: CardWithLimits): accounts.Card {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    last4: row.last4,
    expiryMonth: row.expiryMonth,
    expiryYear: row.expiryYear,
    limits: row.limits.map((l) => ({
      currency: l.currency,
      limit: moneyToString(l.limit.toString()),
      used: moneyToString(l.used.toString()),
    })),
  };
}

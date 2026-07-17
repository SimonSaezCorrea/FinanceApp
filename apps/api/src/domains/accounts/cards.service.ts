import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CardAccount as CardRow } from "@prisma/client";

import { accounts } from "@finance/contracts";

import { CardsRepository } from "./cards.repository";

@Injectable()
export class CardsService {
  constructor(private readonly repo: CardsRepository) {}

  async create(
    userId: string,
    accountId: string,
    input: accounts.CreateCard,
  ): Promise<accounts.Card> {
    const account = await this.repo.accountExists(userId, accountId);
    if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    if (!accounts.isCardableAccountType(account.type)) {
      throw new BadRequestException({ code: "ACCOUNT_CANNOT_HAVE_CARD" });
    }
    const row = await this.repo.create(userId, accountId, {
      name: input.name,
      kind: input.kind,
      last4: input.last4,
      expiryMonth: input.expiryMonth,
      expiryYear: input.expiryYear,
      isActive: input.isActive ?? true,
    });
    return toContract(row);
  }

  async update(
    userId: string,
    accountId: string,
    cardId: string,
    input: accounts.CreateCard,
  ): Promise<accounts.Card> {
    const row = await this.repo.update(userId, accountId, cardId, {
      name: input.name,
      kind: input.kind,
      last4: input.last4,
      expiryMonth: input.expiryMonth,
      expiryYear: input.expiryYear,
      isActive: input.isActive ?? true,
    });
    if (!row) throw new NotFoundException({ code: "CARD_NOT_FOUND" });
    return toContract(row);
  }

  async remove(userId: string, accountId: string, cardId: string): Promise<void> {
    const ok = await this.repo.remove(userId, accountId, cardId);
    if (!ok) throw new NotFoundException({ code: "CARD_NOT_FOUND" });
  }
}

export function toContract(row: CardRow): accounts.Card {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    last4: row.last4,
    expiryMonth: row.expiryMonth,
    expiryYear: row.expiryYear,
    isActive: row.isActive,
  };
}

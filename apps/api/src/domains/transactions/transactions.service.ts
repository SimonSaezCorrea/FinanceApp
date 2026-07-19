import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, Transaction as TransactionRow } from "@prisma/client";

import { transactions } from "@finance/contracts";
import { addMoney, moneyToString, subtractMoney, toMoney } from "@finance/money";

import { TransactionsRepository } from "./transactions.repository";

/** Effective movement fields used to validate rules + enforce credit limits. */
interface EffectiveMovement {
  type: transactions.TransactionType;
  bankAccountId: string;
  cardId?: string | null;
  amount: string;
  currency: string;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly repo: TransactionsRepository) {}

  async list(
    userId: string,
    filters: transactions.TransactionFilters,
  ): Promise<transactions.Transaction[]> {
    const where: Omit<Prisma.TransactionWhereInput, "userId"> = {};
    if (filters.type) where.type = filters.type;
    if (filters.bankAccountId) where.bankAccountId = filters.bankAccountId;
    if (filters.cardId) where.cardId = filters.cardId;
    if (filters.from || filters.to) {
      where.occurredAt = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }
    const rows = await this.repo.list(userId, where);
    return rows.map(toContract);
  }

  async get(userId: string, id: string): Promise<transactions.Transaction> {
    const row = await this.repo.findOne(userId, id);
    if (!row) throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    return toContract(row);
  }

  async create(
    userId: string,
    input: transactions.CreateTransaction,
  ): Promise<transactions.Transaction> {
    await this.validateMovement(userId, {
      type: input.type,
      bankAccountId: input.bankAccountId,
      cardId: input.cardId,
      amount: input.amount,
      currency: input.currency,
    });
    const row = await this.repo.create(userId, {
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      occurredAt: new Date(input.occurredAt),
      category: input.category,
      description: input.description,
      observation: input.observation,
      emisor: input.emisor,
      receptor: input.receptor,
      lugar: input.lugar,
      bankAccountId: input.bankAccountId,
      cardId: input.type === "INCOME" ? null : (input.cardId ?? null),
    });
    return toContract(row);
  }

  async update(
    userId: string,
    id: string,
    input: transactions.UpdateTransaction,
  ): Promise<transactions.Transaction> {
    const current = await this.repo.findOne(userId, id);
    if (!current) throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });

    // Merge patch over current to get the effective movement, then re-validate
    // and enforce (excluding this tx's own contribution to the pool).
    const effectiveType = input.type ?? current.type;
    const effective: EffectiveMovement = {
      type: effectiveType,
      bankAccountId: input.bankAccountId ?? current.bankAccountId ?? "",
      // Switching to INCOME always drops the card (mirrors the `data.card` write
      // below) — otherwise a patch that only changes `type` would validate against
      // the tx's *old* cardId and wrongly reject with CARD_NOT_ALLOWED.
      cardId: effectiveType === "INCOME" ? undefined : (input.cardId ?? current.cardId),
      amount: input.amount ?? current.amount.toString(),
      currency: input.currency ?? current.currency,
    };
    if (effective.bankAccountId) {
      await this.validateMovement(userId, effective, id);
    }

    const data: Prisma.TransactionUpdateInput = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.occurredAt !== undefined) data.occurredAt = new Date(input.occurredAt);
    if (input.category !== undefined) data.category = input.category;
    if (input.description !== undefined) data.description = input.description;
    if (input.observation !== undefined) data.observation = input.observation;
    if (input.emisor !== undefined) data.emisor = input.emisor;
    if (input.receptor !== undefined) data.receptor = input.receptor;
    if (input.lugar !== undefined) data.lugar = input.lugar;
    if (input.bankAccountId !== undefined) {
      data.bankAccount = { connect: { id: input.bankAccountId } };
    }
    // Keep card consistent with the effective type (income never carries a card).
    if (input.cardId !== undefined || input.type !== undefined) {
      const nextCard = effective.type === "INCOME" ? null : (effective.cardId ?? null);
      data.card = nextCard ? { connect: { id: nextCard } } : { disconnect: true };
    }
    const row = await this.repo.update(userId, id, data);
    if (!row) throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    return toContract(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(userId, id);
    if (!ok) throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
  }

  /**
   * Movement rules (spec 007, revised — plus per-card sub-limits): a "standalone
   * credit card" is an account of type CREDIT_LINE whose credit pool lives on the
   * account; but ANY cardable account can grow a CREDIT-kind card (e.g. a checking
   * account's add-on credit card), in which case the SAME account-level pool
   * applies to it too. Individual cards may additionally carry their own narrower
   * sub-limit (one per currency) — the account pool is always the master/shared
   * cap; a card's sub-limit, if set, is an extra, tighter cap on top of it.
   *  - bank must exist (scoped to user)
   *  - INCOME: no card
   *  - EXPENSE on CASH: no card
   *  - EXPENSE on CREDIT_LINE: a card of that account is required
   *  - EXPENSE on other accounts: card optional, but if given it must belong
   *  - Whenever the card used is kind=CREDIT: the amount must fit both the
   *    account's shared pool (creditLimit) and, if set, that card's own sub-limit
   */
  private async validateMovement(
    userId: string,
    m: EffectiveMovement,
    excludeTxId?: string,
  ): Promise<void> {
    const account = await this.repo.findAccount(userId, m.bankAccountId);
    if (!account) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });

    if (m.type === "INCOME") {
      if (m.cardId) throw new BadRequestException({ code: "CARD_NOT_ALLOWED" });
      return;
    }
    // EXPENSE
    if (account.type === "CASH") {
      if (m.cardId) throw new BadRequestException({ code: "CARD_NOT_ALLOWED" });
      return;
    }

    if (account.type === "CREDIT_LINE") {
      if (!m.cardId) throw new BadRequestException({ code: "CARD_REQUIRED" });
      await this.assertCardBelongs(userId, m.cardId, m.bankAccountId);
      await this.assertWithinCreditPool(userId, account, m, excludeTxId);
      await this.assertWithinCardLimit(userId, m.cardId, m, excludeTxId);
      return;
    }

    // Other non-cash accounts (checking/sight/savings/investment): card optional,
    // but a CREDIT-kind card still draws on the account's shared pool + its own sub-limit.
    if (m.cardId) {
      const card = await this.assertCardBelongs(userId, m.cardId, m.bankAccountId);
      if (card.kind === "CREDIT") {
        await this.assertWithinCreditPool(userId, account, m, excludeTxId);
        await this.assertWithinCardLimit(userId, m.cardId, m, excludeTxId);
      }
    }
  }

  private async assertCardBelongs(userId: string, cardId: string, accountId: string) {
    const card = await this.repo.findCardInAccount(userId, cardId, accountId);
    if (!card) throw new BadRequestException({ code: "CARD_ACCOUNT_MISMATCH" });
    return card;
  }

  /** creditUsed = creditUsedInitial + Σexpense − Σincome; reject if used + amount > creditLimit. */
  private async assertWithinCreditPool(
    userId: string,
    account: {
      currency: string;
      creditLimit: { toString(): string };
      creditUsedInitial: { toString(): string };
    },
    m: EffectiveMovement,
    excludeTxId?: string,
  ): Promise<void> {
    const { income, expense } = await this.repo.sumsForAccount(
      userId,
      m.bankAccountId,
      account.currency,
      excludeTxId,
    );
    const used = subtractMoney(addMoney(account.creditUsedInitial.toString(), expense), income);
    const projected = toMoney(used).plus(toMoney(m.amount));
    if (projected.greaterThan(toMoney(account.creditLimit.toString()))) {
      throw new BadRequestException({ code: "CARD_LIMIT_EXCEEDED" });
    }
  }

  /** A card's own sub-limit (if set, for this currency) is a narrower cap on top of the account pool. */
  private async assertWithinCardLimit(
    userId: string,
    cardId: string,
    m: EffectiveMovement,
    excludeTxId?: string,
  ): Promise<void> {
    const limit = await this.repo.findCardLimit(userId, cardId, m.currency);
    if (!limit) return;
    const { income, expense } = await this.repo.sumsForCard(userId, cardId, m.currency, excludeTxId);
    const used = subtractMoney(addMoney(limit.usedInitial.toString(), expense), income);
    const projected = toMoney(used).plus(toMoney(m.amount));
    if (projected.greaterThan(toMoney(limit.limitAmount.toString()))) {
      throw new BadRequestException({ code: "CARD_SUBLIMIT_EXCEEDED" });
    }
  }
}

function toContract(row: TransactionRow): transactions.Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: moneyToString(row.amount.toString()),
    currency: row.currency,
    occurredAt: row.occurredAt.toISOString(),
    category: row.category,
    description: row.description,
    observation: row.observation,
    emisor: row.emisor,
    receptor: row.receptor,
    lugar: row.lugar,
    bankAccountId: row.bankAccountId,
    cardId: row.cardId,
    installmentPlanId: row.installmentPlanId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

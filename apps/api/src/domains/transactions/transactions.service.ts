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
    const effective: EffectiveMovement = {
      type: input.type ?? current.type,
      bankAccountId: input.bankAccountId ?? current.bankAccountId ?? "",
      cardId: input.cardId ?? current.cardId,
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
   * Movement rules (spec 007, revised): a "standalone credit card" is an account
   * of type CREDIT_LINE whose credit pool lives on the account.
   *  - bank must exist (scoped to user)
   *  - INCOME: no card
   *  - EXPENSE on CASH: no card
   *  - EXPENSE on CREDIT_LINE: a card of that account is required; the amount must
   *    fit the account's shared credit pool (creditLimit)
   *  - EXPENSE on other accounts: card optional, but if given it must belong
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
      return;
    }

    // Other non-cash accounts (checking/sight/savings/investment): card optional.
    if (m.cardId) await this.assertCardBelongs(userId, m.cardId, m.bankAccountId);
  }

  private async assertCardBelongs(
    userId: string,
    cardId: string,
    accountId: string,
  ): Promise<void> {
    if (!(await this.repo.cardBelongsToAccount(userId, cardId, accountId))) {
      throw new BadRequestException({ code: "CARD_ACCOUNT_MISMATCH" });
    }
  }

  /** creditUsed = creditUsedInitial + Σexpense − Σincome; reject if used + amount > creditLimit. */
  private async assertWithinCreditPool(
    userId: string,
    account: { creditLimit: { toString(): string }; creditUsedInitial: { toString(): string } },
    m: EffectiveMovement,
    excludeTxId?: string,
  ): Promise<void> {
    const { income, expense } = await this.repo.sumsForAccount(
      userId,
      m.bankAccountId,
      excludeTxId,
    );
    const used = subtractMoney(addMoney(account.creditUsedInitial.toString(), expense), income);
    const projected = toMoney(used).plus(toMoney(m.amount));
    if (projected.greaterThan(toMoney(account.creditLimit.toString()))) {
      throw new BadRequestException({ code: "CARD_LIMIT_EXCEEDED" });
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

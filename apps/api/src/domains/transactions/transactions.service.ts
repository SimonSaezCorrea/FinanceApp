import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, Transaction as TransactionRow } from "@prisma/client";

import { transactions } from "@finance/contracts";
import { moneyToString } from "@finance/money";

import { TransactionsRepository } from "./transactions.repository";

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
    });
    return toContract(row);
  }

  async update(
    userId: string,
    id: string,
    input: transactions.UpdateTransaction,
  ): Promise<transactions.Transaction> {
    const data: Record<string, unknown> = {};
    if (input.type !== undefined) data["type"] = input.type;
    if (input.amount !== undefined) data["amount"] = input.amount;
    if (input.currency !== undefined) data["currency"] = input.currency;
    if (input.occurredAt !== undefined) data["occurredAt"] = new Date(input.occurredAt);
    if (input.category !== undefined) data["category"] = input.category;
    if (input.description !== undefined) data["description"] = input.description;
    if (input.observation !== undefined) data["observation"] = input.observation;
    if (input.emisor !== undefined) data["emisor"] = input.emisor;
    if (input.receptor !== undefined) data["receptor"] = input.receptor;
    if (input.lugar !== undefined) data["lugar"] = input.lugar;
    const row = await this.repo.update(userId, id, data);
    if (!row) throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
    return toContract(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(userId, id);
    if (!ok) throw new NotFoundException({ code: "TRANSACTION_NOT_FOUND" });
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
    installmentPlanId: row.installmentPlanId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

import { Injectable, NotFoundException } from "@nestjs/common";
import type { BankAccount as BankAccountRow } from "@prisma/client";

import { accounts } from "@finance/contracts";
import { moneyToString } from "@finance/money";

import { AccountsRepository } from "./accounts.repository";

@Injectable()
export class AccountsService {
  constructor(private readonly repo: AccountsRepository) {}

  async list(userId: string): Promise<accounts.BankAccount[]> {
    const rows = await this.repo.list(userId);
    return rows.map(toContract);
  }

  async get(userId: string, id: string): Promise<accounts.BankAccount> {
    const row = await this.repo.findOne(userId, id);
    if (!row) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    return toContract(row);
  }

  async create(userId: string, input: accounts.CreateBankAccount): Promise<accounts.BankAccount> {
    const row = await this.repo.create(userId, {
      name: input.name,
      currency: input.currency,
      institution: input.institution,
      currentBalance: input.currentBalance ?? "0",
    });
    return toContract(row);
  }

  async update(
    userId: string,
    id: string,
    input: accounts.UpdateBankAccount,
  ): Promise<accounts.BankAccount> {
    const row = await this.repo.update(userId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.institution !== undefined ? { institution: input.institution } : {}),
      ...(input.currentBalance !== undefined ? { currentBalance: input.currentBalance } : {}),
    });
    if (!row) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
    return toContract(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(userId, id);
    if (!ok) throw new NotFoundException({ code: "ACCOUNT_NOT_FOUND" });
  }
}

function toContract(row: BankAccountRow): accounts.BankAccount {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    institution: row.institution,
    currentBalance: moneyToString(row.currentBalance.toString()),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

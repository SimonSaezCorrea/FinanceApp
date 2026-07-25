import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import { BankAccount, type BankAccountProps, type CardProps } from "../domain/bank-account.aggregate";
import { currentCycleStart } from "../domain/billing-cycle";
import type {
  BankAccountRepositoryPort,
  CreateAccountPlan,
  CreateCardPlan,
} from "../domain/ports/bank-account.repository.port";

const withCards = {
  include: {
    cards: { include: { limits: true } },
    financialInstitution: true,
    billingSettings: true,
  },
} as const;

type Row = NonNullable<Awaited<ReturnType<PrismaService["bankAccount"]["findFirst"]>>> & {
  cards: (Prisma.CardAccountGetPayload<{ include: { limits: true } }>)[];
  financialInstitution?: { name: string } | null;
  billingSettings?: { billingCycleDay: number | null; paymentMethod: "MANUAL" | "AUTOMATIC" } | null;
};

function rowToProps(row: Row): BankAccountProps {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    status: row.status,
    currency: row.currency,
    institution: row.institution,
    institutionId: row.institutionId ?? null,
    institutionName: row.financialInstitution?.name ?? null,
    accountNumber: row.accountNumber ?? null,
    initialBalance: row.initialBalance.toString(),
    currentBalance: row.currentBalance.toString(),
    creditLimit: row.creditLimit.toString(),
    creditUsedInitial: row.creditUsedInitial.toString(),
    creditUsed: row.creditUsed.toString(),
    billingCycleDay: row.billingSettings?.billingCycleDay ?? null,
    paymentMethod: row.billingSettings?.paymentMethod ?? "MANUAL",
    cards: row.cards.map(
      (c): CardProps => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        last4: c.last4,
        expiryMonth: c.expiryMonth,
        expiryYear: c.expiryYear,
        isActive: c.isActive,
        isPrimary: c.isPrimary,
        limits: c.limits.map((l) => ({
          id: l.id,
          currency: l.currency,
          limitAmount: l.limitAmount.toString(),
          usedInitial: l.usedInitial.toString(),
        })),
      }),
    ),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Adapter (FR-011) — the only file in `accounts`' `BankAccount` slice allowed
 * to import `@prisma/client`. */
@Injectable()
export class PrismaBankAccountRepository implements BankAccountRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string, id: string): Promise<BankAccount | null> {
    const row = await this.prisma.bankAccount.findFirst({ where: { id, userId }, ...withCards });
    return row ? BankAccount.fromPersistence(rowToProps(row as Row)) : null;
  }

  async listByUser(userId: string, where: { status?: "ACTIVE" | "INACTIVE" }): Promise<BankAccount[]> {
    const rows = await this.prisma.bankAccount.findMany({
      where: { ...where, userId },
      orderBy: { createdAt: "desc" },
      ...withCards,
    });
    return rows.map((r) => BankAccount.fromPersistence(rowToProps(r as Row)));
  }

  async listDueForBilling(): Promise<BankAccount[]> {
    const rows = await this.prisma.bankAccount.findMany({
      where: { billingSettings: { billingCycleDay: { not: null } } },
      ...withCards,
    });
    return rows.map((r) => BankAccount.fromPersistence(rowToProps(r as Row)));
  }

  async institutionName(id: string): Promise<string | null> {
    const inst = await this.prisma.financialInstitution.findUnique({ where: { id }, select: { name: true } });
    return inst?.name ?? null;
  }

  async createWithCards(userId: string, plan: CreateAccountPlan): Promise<BankAccount> {
    const cardsCreate = plan.cards.map((c) => ({
      userId,
      name: c.name,
      kind: c.kind,
      last4: c.last4,
      expiryMonth: c.expiryMonth,
      expiryYear: c.expiryYear,
      isActive: c.isActive,
      isPrimary: c.isPrimary,
      ...(c.limits.length > 0 ? { limits: { create: c.limits } } : {}),
    }));
    const row = await this.prisma.bankAccount.create({
      data: {
        userId,
        name: plan.name,
        type: plan.type,
        status: plan.status,
        currency: plan.currency,
        institution: plan.institution,
        institutionId: plan.institutionId,
        accountNumber: plan.accountNumber,
        initialBalance: plan.initialBalance,
        currentBalance: plan.initialBalance,
        creditLimit: plan.creditLimit,
        creditUsedInitial: plan.creditUsedInitial,
        creditUsed: plan.creditUsedInitial,
        ...(cardsCreate.length > 0 ? { cards: { create: cardsCreate } } : {}),
      },
      ...withCards,
    });
    await this.prisma.billingSettings.upsert({
      where: { accountId: row.id },
      create: { accountId: row.id, billingCycleDay: plan.billingCycleDay, paymentMethod: plan.paymentMethod },
      update: { billingCycleDay: plan.billingCycleDay, paymentMethod: plan.paymentMethod },
    });
    const fresh = await this.prisma.bankAccount.findFirst({ where: { id: row.id }, ...withCards });
    return BankAccount.fromPersistence(rowToProps((fresh ?? row) as Row));
  }

  async save(aggregate: BankAccount): Promise<void> {
    await this.saveWithTx(this.prisma, aggregate);
  }

  async saveWithTx(tx: unknown, aggregate: BankAccount): Promise<void> {
    const client = tx as PrismaService;
    const snap = aggregate.snapshot();
    await client.bankAccount.update({
      where: { id: snap.id },
      data: {
        name: snap.name,
        type: snap.type,
        status: snap.status,
        currency: snap.currency,
        institution: snap.institution,
        institutionId: snap.institutionId,
        accountNumber: snap.accountNumber,
        initialBalance: snap.initialBalance,
        currentBalance: snap.currentBalance,
        creditLimit: snap.creditLimit,
        creditUsedInitial: snap.creditUsedInitial,
        creditUsed: snap.creditUsed,
      },
    });
    await client.billingSettings.upsert({
      where: { accountId: snap.id },
      create: { accountId: snap.id, billingCycleDay: snap.billingCycleDay, paymentMethod: snap.paymentMethod },
      update: { billingCycleDay: snap.billingCycleDay, paymentMethod: snap.paymentMethod },
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.bankAccount.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async addCard(userId: string, accountId: string, plan: CreateCardPlan): Promise<BankAccount> {
    await this.prisma.cardAccount.create({
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
        ...(plan.limits.length > 0 ? { limits: { create: plan.limits } } : {}),
      },
    });
    const fresh = await this.findById(userId, accountId);
    if (!fresh) throw new Error("account disappeared while adding a card");
    return fresh;
  }

  async updateCard(userId: string, accountId: string, cardId: string, plan: CreateCardPlan): Promise<BankAccount | null> {
    const existing = await this.prisma.cardAccount.findFirst({ where: { id: cardId, accountId, userId } });
    if (!existing) return null;
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
        limits: { deleteMany: {}, create: plan.limits },
      },
    });
    return this.findById(userId, accountId);
  }

  async removeCard(userId: string, accountId: string, cardId: string): Promise<boolean> {
    const result = await this.prisma.cardAccount.deleteMany({ where: { id: cardId, accountId, userId } });
    return result.count > 0;
  }

  async sumByType(userId: string, accountId: string): Promise<{ income: string; expense: string }> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: { userId, bankAccountId: accountId },
      _sum: { amount: true },
    });
    const find = (t: "INCOME" | "EXPENSE") => grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return { income: find("INCOME"), expense: find("EXPENSE") };
  }

  txWindow(userId: string, accountIds: string[], since: Date) {
    if (accountIds.length === 0) return Promise.resolve([]);
    return this.prisma.transaction.findMany({
      where: { userId, bankAccountId: { in: accountIds }, occurredAt: { gte: since } },
      select: { bankAccountId: true, type: true, amount: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
    });
  }

  async cardSums(
    userId: string,
    cardsInfo: { id: string; billingCycleDay: number | null }[],
  ): Promise<{ cardId: string | null; currency: string; type: "INCOME" | "EXPENSE"; sum: string }[]> {
    if (cardsInfo.length === 0) return [];
    const now = new Date();
    const result: { cardId: string | null; currency: string; type: "INCOME" | "EXPENSE"; sum: string }[] = [];
    for (const c of cardsInfo) {
      const since = currentCycleStart(c.billingCycleDay, now);
      const grouped = await this.prisma.transaction.groupBy({
        by: ["currency", "type"],
        where: { userId, cardId: c.id, ...(since ? { occurredAt: { gte: since } } : {}) },
        _sum: { amount: true },
      });
      for (const g of grouped) {
        result.push({ cardId: c.id, currency: g.currency, type: g.type, sum: g._sum.amount?.toString() ?? "0" });
      }
    }
    return result;
  }
}

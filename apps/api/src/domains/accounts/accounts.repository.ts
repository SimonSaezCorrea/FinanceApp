import { Injectable } from "@nestjs/common";
import { Prisma, TransactionType } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";

const withCards = {
  include: {
    cards: { include: { limits: true } },
    financialInstitution: true,
    billingSettings: true,
  },
} as const;

/** All access scoped by userId (Constitution Principle II). */
@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, where: Omit<Prisma.BankAccountWhereInput, "userId"> = {}) {
    return this.prisma.bankAccount.findMany({
      where: { ...where, userId },
      orderBy: { createdAt: "desc" },
      ...withCards,
    });
  }

  findOne(userId: string, id: string) {
    return this.prisma.bankAccount.findFirst({ where: { id, userId }, ...withCards });
  }

  async institutionName(id: string): Promise<string | null> {
    const inst = await this.prisma.financialInstitution.findUnique({
      where: { id },
      select: { name: true },
    });
    return inst?.name ?? null;
  }

  create(userId: string, data: Omit<Prisma.BankAccountUncheckedCreateInput, "userId">) {
    return this.prisma.bankAccount.create({ data: { ...data, userId }, ...withCards });
  }

  async update(userId: string, id: string, data: Prisma.BankAccountUpdateInput) {
    const result = await this.prisma.bankAccount.updateMany({ where: { id, userId }, data });
    if (result.count === 0) return null;
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.bankAccount.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  /** Linked transactions since `since`, scoped to user + accounts, for balance series. */
  txWindow(userId: string, accountIds: string[], since: Date) {
    if (accountIds.length === 0) return Promise.resolve([]);
    return this.prisma.transaction.findMany({
      where: { userId, bankAccountId: { in: accountIds }, occurredAt: { gte: since } },
      select: { bankAccountId: true, type: true, amount: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
    });
  }

  /** Sum of linked transaction amounts by type, scoped to user + account. */
  async sumByType(userId: string, accountId: string): Promise<{ income: string; expense: string }> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: { userId, bankAccountId: accountId },
      _sum: { amount: true },
    });
    const find = (t: TransactionType) =>
      grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    return { income: find(TransactionType.INCOME), expense: find(TransactionType.EXPENSE) };
  }

  /** Billing-period history for an account's credit pool, most recent first. */
  listCreditStatements(userId: string, accountId: string) {
    return this.prisma.creditStatement.findMany({
      where: { accountId, account: { userId } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** One statement, scoped to the account/user. */
  findStatement(userId: string, accountId: string, statementId: string) {
    return this.prisma.creditStatement.findFirst({
      where: { id: statementId, accountId, account: { userId } },
    });
  }

  /** The account's currently OPEN billing period (`closedAt: null`), if any — used by
   * `BillingGenerationService` to decide whether there's anything to close ("no usage,
   * no statement was ever created, nothing to generate"). */
  findOpenStatement(accountId: string) {
    return this.prisma.creditStatement.findFirst({
      where: { accountId, closedAt: null },
    });
  }

  /** Every account (any user) with a billing day configured — the cron's universe;
   * a system job, not a per-request scoped query. */
  listAccountsWithBillingCycle() {
    return this.prisma.bankAccount.findMany({
      where: { billingSettings: { billingCycleDay: { not: null } } },
      ...withCards,
    });
  }

  /** Seals an OPEN statement at the given boundary — it stops accepting new links;
   * the next contributing transaction lazily opens a fresh one for the account. */
  closeStatement(statementId: string, closedAt: Date) {
    return this.prisma.creditStatement.update({ where: { id: statementId }, data: { closedAt } });
  }

  /** Live sum (Σexpense − Σincome) of every transaction currently linked to this
   * statement — the displayed `amount` while unpaid (see `CreditStatement`). */
  async sumLinkedTransactions(statementId: string): Promise<string> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ["type"],
      where: { creditStatementId: statementId },
      _sum: { amount: true },
    });
    const find = (t: TransactionType) =>
      grouped.find((g) => g.type === t)?._sum.amount?.toString() ?? "0";
    const expense = find(TransactionType.EXPENSE);
    const income = find(TransactionType.INCOME);
    return new Prisma.Decimal(expense).minus(income).toString();
  }

  /**
   * Pay a statement atomically: creates the real EXPENSE payment transaction on
   * `fromAccountId`, decrements the credit account's `creditUsed` by the same amount,
   * and freezes the statement as paid (closing it too, if it was still OPEN).
   */
  payStatement(params: {
    userId: string;
    creditAccountId: string;
    statementId: string;
    fromAccountId: string;
    amount: string;
    currency: string;
    description: string;
    wasClosedAt: Date | null;
  }) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const paymentTx = await tx.transaction.create({
        data: {
          userId: params.userId,
          bankAccountId: params.fromAccountId,
          type: "EXPENSE",
          amount: params.amount,
          currency: params.currency,
          occurredAt: now,
          category: "Pago facturación",
          description: params.description,
        },
      });
      await tx.bankAccount.update({
        where: { id: params.creditAccountId },
        data: { creditUsed: { decrement: params.amount } },
      });
      return tx.creditStatement.update({
        where: { id: params.statementId },
        data: {
          amount: params.amount,
          paidAt: now,
          paidFromAccountId: params.fromAccountId,
          paidTransactionId: paymentTx.id,
          closedAt: params.wasClosedAt ?? now,
        },
      });
    });
  }

  /** Correct a PAID statement's frozen amount — no cascade to the linked payment
   * transaction or to `creditUsed` (deliberate, see `CreditStatement`). */
  updateStatementAmount(statementId: string, amount: string) {
    return this.prisma.creditStatement.update({ where: { id: statementId }, data: { amount } });
  }

  /** Create-or-update the account's billing settings (1:1, split out from `BankAccount`
   * so it can be reviewed/maintained independently — see `BillingSettings` in schema). */
  upsertBillingSettings(
    accountId: string,
    data: { billingCycleDay?: number | null; paymentMethod?: "MANUAL" | "AUTOMATIC" },
  ) {
    return this.prisma.billingSettings.upsert({
      where: { accountId },
      create: { accountId, ...data },
      update: data,
    });
  }
}

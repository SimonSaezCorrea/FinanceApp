import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Debt } from "../../../../src/domains/debt/domain/debt.aggregate";
import { PrismaDebtRepository } from "../../../../src/domains/debt/infrastructure/prisma-debt.repository";
import { RecurringExpense } from "../../../../src/domains/recurring-expense/domain/recurring-expense.aggregate";
import { PrismaRecurringExpenseRepository } from "../../../../src/domains/recurring-expense/infrastructure/prisma-recurring-expense.repository";
import { SavingsGoal } from "../../../../src/domains/savings-goal/domain/savings-goal.aggregate";
import { PrismaSavingsGoalRepository } from "../../../../src/domains/savings-goal/infrastructure/prisma-savings-goal.repository";
import { PrismaTransactionWriterRepository } from "../../../../src/domains/transaction/infrastructure/prisma-transaction-writer.repository";
import { generateRowId } from "../../../../src/infra/id/generate-row-id";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { buildBankAccountRepo, buildCreditStatementRepo } from "../../support/repositories";

/**
 * The `*WithTx` methods the template import (specs/027) composes into ONE
 * transaction: each must persist with the caller's transaction and disappear
 * when it rolls back — that is the whole all-or-nothing guarantee (FR-025).
 */
describe("ports enlisted in the template import's transaction (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const debts = new PrismaDebtRepository(prisma);
  const recurring = new PrismaRecurringExpenseRepository(prisma);
  const goals = new PrismaSavingsGoalRepository(prisma);
  const writer = new PrismaTransactionWriterRepository(prisma);
  const accounts = buildBankAccountRepo(prisma);
  const statements = buildCreditStatementRepo(prisma);
  const userId = `u_${randomUUID()}`;
  let accountId: string;
  const ROLLBACK = new Error("rollback");

  /** Runs `fn` in a transaction that is always rolled back. */
  async function inRolledBackTx(fn: (tx: unknown) => Promise<void>): Promise<void> {
    await expect(
      prisma.$transaction(async (tx) => {
        await fn(tx);
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    const account = await prisma.bankAccount.create({
      data: {
        userId,
        name: "Cuenta",
        type: "CREDIT_CARD",
        currency: "CLP",
        initialBalance: "1000",
        currentBalance: "1000",
        creditLimit: "500000",
        creditUsedInitial: "0",
        creditUsed: "0",
      },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.creditStatement.deleteMany({ where: { accountId } });
    await prisma.debt.deleteMany({ where: { userId } });
    await prisma.recurringExpense.deleteMany({ where: { userId } });
    await prisma.savingsGoal.deleteMany({ where: { userId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const debtPlan = () =>
    Debt.planCreation({
      direction: "OWED_TO_YOU",
      counterparty: "Victor",
      principal: "200000",
      currency: "CLP",
      openedAt: new Date("2026-02-14T00:00:00Z"),
      totalInstallments: 4,
      frequency: "MONTHLY",
      frequencyInterval: 1,
    });

  it("DebtRepositoryPort.createWithTx persists and rolls back with its transaction", async () => {
    await inRolledBackTx(async (tx) => {
      const created = await debts.createWithTx(tx, userId, debtPlan());
      expect(created.id).toBeTruthy();
    });
    expect(await prisma.debt.count({ where: { userId } })).toBe(0);
    await prisma.$transaction((tx) => debts.createWithTx(tx, userId, debtPlan()));
    expect(await prisma.debt.count({ where: { userId } })).toBe(1);
  });

  it("RecurringExpenseRepositoryPort.createWithTx persists and rolls back", async () => {
    const plan = RecurringExpense.planCreation({
      label: "Spotify",
      amount: "6990",
      currency: "CLP",
      frequency: "MONTHLY",
      interval: 1,
      anchorDate: new Date("2026-01-05T00:00:00Z"),
    });
    await inRolledBackTx(async (tx) => {
      await recurring.createWithTx(tx, userId, plan);
    });
    expect(await prisma.recurringExpense.count({ where: { userId } })).toBe(0);
    await prisma.$transaction((tx) => recurring.createWithTx(tx, userId, plan));
    expect(await prisma.recurringExpense.count({ where: { userId } })).toBe(1);
  });

  it("SavingsGoalRepositoryPort.createWithTx persists and rolls back", async () => {
    const plan = SavingsGoal.planCreation({
      title: "Viaje",
      targetAmount: "1000000",
      currency: "CLP",
    });
    await inRolledBackTx(async (tx) => {
      await goals.createWithTx(tx, userId, plan);
    });
    expect(await prisma.savingsGoal.count({ where: { userId } })).toBe(0);
    await prisma.$transaction((tx) => goals.createWithTx(tx, userId, plan));
    expect(await prisma.savingsGoal.count({ where: { userId } })).toBe(1);
  });

  it("adjustOpeningWithTx moves only the opening figures", async () => {
    await prisma.$transaction((tx) => accounts.adjustOpeningWithTx(tx, accountId, "-300", "250"));
    const row = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(row.initialBalance.toString()).toBe("700");
    expect(row.creditUsedInitial.toString()).toBe("250");
    expect(row.currentBalance.toString()).toBe("1000");
    expect(row.creditUsed.toString()).toBe("0");
  });

  it("createManyWithTx keeps a provided id and mints one when absent", async () => {
    const id = generateRowId();
    const base = {
      userId,
      bankAccountId: accountId,
      type: "EXPENSE" as const,
      amount: "10",
      currency: "CLP",
      occurredAt: new Date("2026-03-01T00:00:00Z"),
      categoryId: null,
      description: "x",
    };
    await prisma.$transaction((tx) => writer.createManyWithTx(tx, [{ ...base, id }, base]));
    const rows = await prisma.transaction.findMany({ where: { userId } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toContain(id);
  });

  it("findOrCreateOpenForAccountWithTx rolls back the period it created", async () => {
    await inRolledBackTx(async (tx) => {
      const open = await statements.findOrCreateOpenForAccountWithTx(
        tx,
        accountId,
        new Date("2026-01-01T00:00:00Z"),
      );
      expect(open.id).toBeTruthy();
    });
    expect(await prisma.creditStatement.count({ where: { accountId } })).toBe(0);
    const first = await prisma.$transaction((tx) =>
      statements.findOrCreateOpenForAccountWithTx(tx, accountId, new Date("2026-01-01T00:00:00Z")),
    );
    const again = await prisma.$transaction((tx) =>
      statements.findOrCreateOpenForAccountWithTx(tx, accountId, new Date("2026-01-01T00:00:00Z")),
    );
    expect(again.id).toBe(first.id);
  });
});

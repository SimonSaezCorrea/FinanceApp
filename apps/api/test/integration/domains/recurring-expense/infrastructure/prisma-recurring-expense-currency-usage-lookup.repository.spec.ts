import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaRecurringExpenseCurrencyUsageLookupRepository } from "../../../../../src/domains/recurring-expense/infrastructure/prisma-recurring-expense-currency-usage-lookup.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("PrismaRecurringExpenseCurrencyUsageLookupRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaRecurringExpenseCurrencyUsageLookupRepository(prisma);
  const userId = `u_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    await prisma.recurringExpense.create({
      data: {
        userId,
        label: "Netflix",
        amount: "10",
        currency: "USD",
        frequency: "MONTHLY",
        anchorDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  });

  afterAll(async () => {
    await prisma.recurringExpense.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("returns true when the user has a series in that currency", async () => {
    expect(await repo.isCurrencyInUse(userId, "USD")).toBe(true);
  });

  it("returns false for a currency the user has no series in", async () => {
    expect(await repo.isCurrencyInUse(userId, "CLF")).toBe(false);
  });

  it("returns false when scoped to another user", async () => {
    expect(await repo.isCurrencyInUse(`u_${randomUUID()}`, "USD")).toBe(false);
  });
});

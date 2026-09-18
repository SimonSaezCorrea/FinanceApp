import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaSavingsGoalCurrencyUsageLookupRepository } from "../../../../../src/domains/savings-goal/infrastructure/prisma-savings-goal-currency-usage-lookup.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("PrismaSavingsGoalCurrencyUsageLookupRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaSavingsGoalCurrencyUsageLookupRepository(prisma);
  const userId = `u_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    await prisma.savingsGoal.create({
      data: { userId, title: "Vacaciones", targetAmount: "5000", currency: "USD" },
    });
  });

  afterAll(async () => {
    await prisma.savingsGoal.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("returns true when the user has a goal in that currency", async () => {
    expect(await repo.isCurrencyInUse(userId, "USD")).toBe(true);
  });

  it("returns false for a currency the user has no goal in", async () => {
    expect(await repo.isCurrencyInUse(userId, "CLF")).toBe(false);
  });

  it("returns false when scoped to another user", async () => {
    expect(await repo.isCurrencyInUse(`u_${randomUUID()}`, "USD")).toBe(false);
  });
});

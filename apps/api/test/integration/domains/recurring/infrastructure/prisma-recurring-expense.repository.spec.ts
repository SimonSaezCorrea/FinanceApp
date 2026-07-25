import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaRecurringExpenseRepository } from "../../../../../src/domains/recurring/infrastructure/prisma-recurring-expense.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing
 * at a reachable Postgres (see `docker-compose.yml` / `pnpm db:reset`). Not
 * part of `test:unit` (SC-002/SC-005).
 */
describe("PrismaRecurringExpenseRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaRecurringExpenseRepository(prisma);
  const userId = `u_${randomUUID()}`;
  let expenseId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
  });

  afterAll(async () => {
    await prisma.recurringExpense.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("create persists the recurring expense", async () => {
    const created = await repo.create(userId, {
      label: "Arriendo",
      amount: "520000",
      currency: "CLP",
      category: "Vivienda",
      frequency: "MONTHLY",
      interval: 1,
      anchorDate: new Date("2026-01-05T00:00:00.000Z"),
      bankAccountId: null,
      active: true,
      notes: null,
    });
    expenseId = created.id;
    expect(created.toContract(new Date()).label).toBe("Arriendo");
    expect(created.toContract(new Date()).amount).toBe("520000.0000");
  });

  it("findOne returns the recurring expense scoped to the user, null otherwise", async () => {
    const found = await repo.findOne(userId, expenseId);
    expect(found?.id).toBe(expenseId);
    expect(await repo.findOne(`u_${randomUUID()}`, expenseId)).toBeNull();
  });

  it("save persists scalar-field updates", async () => {
    const expense = await repo.findOne(userId, expenseId);
    expense!.applyUpdate({ active: false, label: "Arriendo depto" });
    await repo.save(expense!);
    const reloaded = await repo.findOne(userId, expenseId);
    expect(reloaded?.toContract(new Date()).active).toBe(false);
    expect(reloaded?.toContract(new Date()).label).toBe("Arriendo depto");
  });

  it("remove deletes the recurring expense, scoped to ownership", async () => {
    expect(await repo.remove(userId, expenseId)).toBe(true);
    expect(await repo.findOne(userId, expenseId)).toBeNull();
  });
});

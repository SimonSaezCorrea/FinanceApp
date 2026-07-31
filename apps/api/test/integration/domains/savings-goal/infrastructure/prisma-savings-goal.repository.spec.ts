import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaSavingsGoalRepository } from "../../../../../src/domains/savings-goal/infrastructure/prisma-savings-goal.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing
 * at a reachable Postgres (see `docker-compose.yml` / `pnpm db:reset`). Not
 * part of `test:unit` (SC-002/SC-005).
 */
describe("PrismaSavingsGoalRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaSavingsGoalRepository(prisma);
  const userId = `u_${randomUUID()}`;
  let goalId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
  });

  afterAll(async () => {
    await prisma.savingsGoal.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("create persists the savings goal", async () => {
    const created = await repo.create(userId, {
      title: "Emergency fund",
      targetAmount: "5000",
      currency: "USD",
      deadline: new Date("2026-12-31T00:00:00.000Z"),
    });
    goalId = created.id;
    expect(created.toContract().title).toBe("Emergency fund");
    expect(created.toContract().targetAmount).toBe("5000.0000");
  });

  it("findOne returns the goal scoped to the user, null otherwise", async () => {
    const found = await repo.findOne(userId, goalId);
    expect(found?.id).toBe(goalId);
    expect(await repo.findOne(`u_${randomUUID()}`, goalId)).toBeNull();
  });

  it("save persists scalar-field updates", async () => {
    const goal = await repo.findOne(userId, goalId);
    goal!.applyUpdate({ title: "New title", targetAmount: "6000" });
    await repo.save(goal!);
    const reloaded = await repo.findOne(userId, goalId);
    expect(reloaded?.toContract().title).toBe("New title");
    expect(reloaded?.toContract().targetAmount).toBe("6000.0000");
  });

  it("remove deletes the goal, scoped to ownership", async () => {
    expect(await repo.remove(userId, goalId)).toBe(true);
    expect(await repo.findOne(userId, goalId)).toBeNull();
  });
});

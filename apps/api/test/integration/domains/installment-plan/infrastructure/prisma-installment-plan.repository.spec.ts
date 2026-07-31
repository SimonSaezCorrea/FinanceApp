import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildInstallmentPlanRepo } from "../../../support/repositories";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing at
 * a reachable Postgres (see `docker-compose.yml` / `pnpm db:reset`). Not part
 * of `test:unit` (SC-002/SC-005).
 */
describe("PrismaInstallmentPlanRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = buildInstallmentPlanRepo(prisma);
  const userId = `u_${randomUUID()}`;
  let planId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
  });

  afterAll(async () => {
    await prisma.installmentPlan.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("create persists the plan with its scheduled payments", async () => {
    const created = await repo.create(userId, {
      title: "Laptop",
      totalPrincipal: "1200",
      installmentCount: 3,
      startDate: new Date("2026-01-15T00:00:00.000Z"),
      currency: "USD",
      frequency: "MONTHLY",
      frequencyInterval: 1,
      notes: null,
      payments: [
        { sequence: 1, dueDate: new Date("2026-01-15"), amount: "400" },
        { sequence: 2, dueDate: new Date("2026-02-15"), amount: "400" },
        { sequence: 3, dueDate: new Date("2026-03-15"), amount: "400" },
      ],
    });
    planId = created.id;
    expect(created.payments).toHaveLength(3);
    expect(created.totalPrincipal).toBe("1200.0000");
  });

  it("findOne returns the plan scoped to the user, null otherwise", async () => {
    const found = await repo.findOne(userId, planId);
    expect(found?.id).toBe(planId);
    expect(await repo.findOne(`u_${randomUUID()}`, planId)).toBeNull();
  });

  it("setPaymentPaidAt sets and clears a payment's paidAt, scoped to ownership", async () => {
    const paid = await repo.setPaymentPaidAt(userId, planId, 1, new Date());
    expect(paid).toBe(true);
    const reloaded = await repo.findOne(userId, planId);
    expect(reloaded?.payments.find((p) => p.sequence === 1)?.paidAt).not.toBeNull();

    const unpaid = await repo.setPaymentPaidAt(userId, planId, 1, null);
    expect(unpaid).toBe(true);
    const reloaded2 = await repo.findOne(userId, planId);
    expect(reloaded2?.payments.find((p) => p.sequence === 1)?.paidAt).toBeNull();

    expect(await repo.setPaymentPaidAt(`u_${randomUUID()}`, planId, 1, new Date())).toBe(false);
  });

  it("save persists scalar-field updates only, never the schedule", async () => {
    const plan = await repo.findOne(userId, planId);
    plan!.applyUpdate({ title: "Renamed" });
    await repo.save(plan!);
    const reloaded = await repo.findOne(userId, planId);
    expect(reloaded?.title).toBe("Renamed");
    expect(reloaded?.payments).toHaveLength(3);
  });

  it("remove deletes the plan, scoped to ownership", async () => {
    expect(await repo.remove(userId, planId)).toBe(true);
    expect(await repo.findOne(userId, planId)).toBeNull();
  });
});

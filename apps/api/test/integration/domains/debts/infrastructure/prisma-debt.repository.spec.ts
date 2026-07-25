import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaDebtRepository } from "../../../../../src/domains/debts/infrastructure/prisma-debt.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing
 * at a reachable Postgres (see `docker-compose.yml` / `pnpm db:reset`). Not
 * part of `test:unit` (SC-002/SC-005).
 */
describe("PrismaDebtRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaDebtRepository(prisma);
  const userId = `u_${randomUUID()}`;
  let debtId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
  });

  afterAll(async () => {
    await prisma.debt.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("create persists the debt", async () => {
    const created = await repo.create(userId, {
      direction: "YOU_OWE",
      counterparty: "Acme Corp",
      principal: "1200",
      currency: "USD",
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
      dueAt: null,
      interestApr: null,
      notes: null,
      settledAt: null,
      totalInstallments: 3,
      paidInstallments: 0,
      installmentAmount: null,
      frequency: "MONTHLY",
      frequencyInterval: 1,
    });
    debtId = created.id;
    expect(created.toContract().counterparty).toBe("Acme Corp");
    expect(created.toContract().principal).toBe("1200.0000");
  });

  it("findOne returns the debt scoped to the user, null otherwise", async () => {
    const found = await repo.findOne(userId, debtId);
    expect(found?.id).toBe(debtId);
    expect(await repo.findOne(`u_${randomUUID()}`, debtId)).toBeNull();
  });

  it("save persists scalar-field and settlement updates", async () => {
    const debt = await repo.findOne(userId, debtId);
    debt!.registerPayment();
    await repo.save(debt!);
    const reloaded = await repo.findOne(userId, debtId);
    expect(reloaded?.paidInstallments).toBe(1);
  });

  it("remove deletes the debt, scoped to ownership", async () => {
    expect(await repo.remove(userId, debtId)).toBe(true);
    expect(await repo.findOne(userId, debtId)).toBeNull();
  });
});

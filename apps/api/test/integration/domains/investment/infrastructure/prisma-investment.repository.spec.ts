import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaInvestmentRepository } from "../../../../../src/domains/investment/infrastructure/prisma-investment.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing
 * at a reachable Postgres (see `docker-compose.yml` / `pnpm db:reset`). Not
 * part of `test:unit` (SC-002/SC-005).
 */
describe("PrismaInvestmentRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaInvestmentRepository(prisma);
  const userId = `u_${randomUUID()}`;
  let investmentId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
  });

  afterAll(async () => {
    await prisma.investment.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("create persists the investment", async () => {
    const created = await repo.create(userId, {
      kind: "ETF",
      label: "Vanguard S&P 500",
      currency: "USD",
      symbol: "VOO",
      shares: "12.34567890",
      annualRate: null,
      principal: null,
      bankAccountId: null,
      openedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    investmentId = created.id;
    expect(created.toContract().label).toBe("Vanguard S&P 500");
    expect(created.toContract().shares).toBe("12.34567890");
  });

  it("findOne returns the investment scoped to the user, null otherwise", async () => {
    const found = await repo.findOne(userId, investmentId);
    expect(found?.id).toBe(investmentId);
    expect(await repo.findOne(`u_${randomUUID()}`, investmentId)).toBeNull();
  });

  it("save persists scalar-field updates", async () => {
    const investment = await repo.findOne(userId, investmentId);
    investment!.applyUpdate({ label: "Renamed ETF" });
    await repo.save(investment!);
    const reloaded = await repo.findOne(userId, investmentId);
    expect(reloaded?.toContract().label).toBe("Renamed ETF");
  });

  it("remove deletes the investment, scoped to ownership", async () => {
    expect(await repo.remove(userId, investmentId)).toBe(true);
    expect(await repo.findOne(userId, investmentId)).toBeNull();
  });
});

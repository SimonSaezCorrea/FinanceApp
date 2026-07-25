import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaSavingsEntryRepository } from "../../../../../src/domains/savings/infrastructure/prisma-savings-entry.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing
 * at a reachable Postgres. Not part of `test:unit` (SC-002/SC-005).
 */
describe("PrismaSavingsEntryRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaSavingsEntryRepository(prisma);
  const userId = `u_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
  });

  afterAll(async () => {
    await prisma.savingsEntry.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("create persists the entry", async () => {
    const created = await repo.create(userId, {
      savingsGoalId: null,
      amount: "250",
      currency: "USD",
      contributedAt: new Date("2026-02-01T00:00:00.000Z"),
      note: null,
    });
    expect(created.toContract().amount).toBe("250.0000");
  });

  it("list returns entries scoped to the user", async () => {
    const rows = await repo.list(userId);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.userId === userId)).toBe(true);
  });
});

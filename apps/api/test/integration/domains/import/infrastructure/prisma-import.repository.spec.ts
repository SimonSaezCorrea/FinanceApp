import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaImportRepository } from "../../../../../src/domains/import/infrastructure/prisma-import.repository";
import { buildTransactionWriterRepo } from "../../../support/repositories";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing
 * at a reachable Postgres. Not part of `test:unit` (SC-002/SC-005).
 */
describe("PrismaImportRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaImportRepository(buildTransactionWriterRepo(prisma));
  const userId = `u_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("bulk-inserts every planned row and returns the inserted count", async () => {
    const count = await repo.importRows(userId, [
      {
        type: "INCOME",
        amount: "100.00",
        currency: "USD",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        category: null,
        description: null,
        bankAccountId: null,
      },
      {
        type: "EXPENSE",
        amount: "40.50",
        currency: "USD",
        occurredAt: new Date("2026-01-02T00:00:00.000Z"),
        category: "groceries",
        description: "supermarket",
        bankAccountId: null,
      },
    ]);

    expect(count).toBe(2);

    const rows = await prisma.transaction.findMany({ where: { userId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userId === userId)).toBe(true);
  });
});

import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaDebtCurrencyUsageLookupRepository } from "../../../../../src/domains/debt/infrastructure/prisma-debt-currency-usage-lookup.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("PrismaDebtCurrencyUsageLookupRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaDebtCurrencyUsageLookupRepository(prisma);
  const userId = `u_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    await prisma.debt.create({
      data: {
        userId,
        direction: "YOU_OWE",
        counterparty: "Acme Corp",
        principal: "1200",
        currency: "USD",
        openedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  });

  afterAll(async () => {
    await prisma.debt.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("returns true when the user has a debt in that currency", async () => {
    expect(await repo.isCurrencyInUse(userId, "USD")).toBe(true);
  });

  it("returns false for a currency the user has no debt in", async () => {
    expect(await repo.isCurrencyInUse(userId, "CLF")).toBe(false);
  });

  it("returns false when scoped to another user", async () => {
    expect(await repo.isCurrencyInUse(`u_${randomUUID()}`, "USD")).toBe(false);
  });
});

import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaCardLimitCurrencyUsageLookupRepository } from "../../../../../src/domains/card-limit/infrastructure/prisma-card-limit-currency-usage-lookup.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

describe("PrismaCardLimitCurrencyUsageLookupRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaCardLimitCurrencyUsageLookupRepository(prisma);
  const userId = `u_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    const account = await prisma.bankAccount.create({
      data: { userId, name: "Visa Crédito", type: "CREDIT_CARD", currency: "CLP" },
    });
    const card = await prisma.cardAccount.create({
      data: {
        accountId: account.id,
        userId,
        name: "Visa Adicional",
        kind: "CREDIT",
        last4: "1234",
        expiryMonth: 12,
        expiryYear: 2030,
      },
    });
    await prisma.cardLimit.create({
      data: { cardId: card.id, currency: "USD", limitAmount: "500" },
    });
  });

  afterAll(async () => {
    await prisma.cardLimit.deleteMany({ where: { card: { userId } } });
    await prisma.cardAccount.deleteMany({ where: { userId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("returns true when the user has a card sub-limit in that currency", async () => {
    expect(await repo.isCurrencyInUse(userId, "USD")).toBe(true);
  });

  it("returns false for a currency the user has no sub-limit in", async () => {
    expect(await repo.isCurrencyInUse(userId, "CLF")).toBe(false);
  });

  it("returns false when scoped to another user", async () => {
    expect(await repo.isCurrencyInUse(`u_${randomUUID()}`, "USD")).toBe(false);
  });
});

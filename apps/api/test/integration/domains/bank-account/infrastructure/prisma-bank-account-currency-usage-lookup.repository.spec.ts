import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaBankAccountCurrencyUsageLookupRepository } from "../../../../../src/domains/bank-account/infrastructure/prisma-bank-account-currency-usage-lookup.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (specs/020) — requires `DATABASE_URL` pointing
 * at a reachable Postgres. Not part of `test:unit`.
 */
describe("PrismaBankAccountCurrencyUsageLookupRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaBankAccountCurrencyUsageLookupRepository(prisma);
  const userId = `u_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    await prisma.bankAccount.create({ data: { userId, name: "Cuenta USD", currency: "USD" } });
  });

  afterAll(async () => {
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("returns true when the user has an account in that currency", async () => {
    expect(await repo.isCurrencyInUse(userId, "USD")).toBe(true);
  });

  it("returns false for a currency the user has no account in", async () => {
    expect(await repo.isCurrencyInUse(userId, "CLF")).toBe(false);
  });

  it("returns false when scoped to another user", async () => {
    expect(await repo.isCurrencyInUse(`u_${randomUUID()}`, "USD")).toBe(false);
  });
});

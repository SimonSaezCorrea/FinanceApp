import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaAccountCreditLimitCurrencyUsageLookupRepository } from "../../../../src/domains/account-credit-limit/infrastructure/prisma-account-credit-limit-currency-usage-lookup.repository";
import { PrismaAccountCreditLimitRepository } from "../../../../src/domains/account-credit-limit/infrastructure/prisma-account-credit-limit.repository";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

describe("PrismaAccountCreditLimitRepository (integration, spec 039)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaAccountCreditLimitRepository(prisma);
  const usage = new PrismaAccountCreditLimitCurrencyUsageLookupRepository(prisma);
  const userId = `u_${randomUUID()}`;
  let accountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    accountId = (
      await prisma.bankAccount.create({
        data: { userId, name: "Visa", type: "CREDIT_CARD", currency: "CLP" },
      })
    ).id;
    await prisma.$transaction((tx) =>
      repo.createForAccountWithTx(tx, accountId, [
        { currency: "USD", limitAmount: "3000", usedInitial: "10" },
      ]),
    );
  });

  afterAll(async () => {
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("lists an account's lines and finds one by currency, only for its owner", async () => {
    const lines = await repo.listByAccounts([accountId]);
    expect(lines).toEqual([
      expect.objectContaining({
        accountId,
        currency: "USD",
        limitAmount: "3000",
        usedInitial: "10",
      }),
    ]);
    expect(lines[0]!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(await repo.findForAccountCurrency(userId, accountId, "USD")).not.toBeNull();
    expect(await repo.findForAccountCurrency(`u_${randomUUID()}`, accountId, "USD")).toBeNull();
    expect(await repo.findForAccountCurrency(userId, accountId, "CLF")).toBeNull();
  });

  it("replaces the set: keeps and updates a currency, adds new ones, drops the rest", async () => {
    const before = (await repo.listByAccounts([accountId]))[0]!;
    await prisma.$transaction((tx) =>
      repo.replaceForAccountWithTx(tx, accountId, [
        { currency: "USD", limitAmount: "3500", usedInitial: "10" },
        { currency: "CLF", limitAmount: "20", usedInitial: "0" },
      ]),
    );
    const after = await repo.listByAccounts([accountId]);
    expect(after.map((l) => [l.currency, l.limitAmount])).toEqual([
      ["CLF", "20"],
      ["USD", "3500"],
    ]);
    expect(after.find((l) => l.currency === "USD")!.id).toBe(before.id);
    expect(await usage.isCurrencyInUse(userId, "CLF")).toBe(true);

    await prisma.$transaction((tx) => repo.replaceForAccountWithTx(tx, accountId, []));
    expect(await repo.listByAccounts([accountId])).toEqual([]);
    expect(await usage.isCurrencyInUse(userId, "USD")).toBe(false);
  });

  it("one line per currency per account", async () => {
    await prisma.$transaction((tx) =>
      repo.createForAccountWithTx(tx, accountId, [
        { currency: "USD", limitAmount: "1", usedInitial: "0" },
      ]),
    );
    await expect(
      prisma.$transaction((tx) =>
        repo.createForAccountWithTx(tx, accountId, [
          { currency: "USD", limitAmount: "2", usedInitial: "0" },
        ]),
      ),
    ).rejects.toThrow();
  });
});

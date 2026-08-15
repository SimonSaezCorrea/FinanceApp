import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildWalletItemRepo } from "../../../support/repositories";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing
 * at a reachable Postgres (see `docker-compose.yml` / `pnpm db:reset`). Not
 * part of `test:unit` (SC-002/SC-005).
 */
describe("PrismaWalletItemRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = buildWalletItemRepo(prisma);
  const userId = `u_${randomUUID()}`;
  let accountId: string;
  let itemId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    const account = await prisma.bankAccount.create({
      data: {
        userId,
        name: "Checking",
        type: "CHECKING",
        currency: "USD",
        accountNumber: "1234",
        initialBalance: "0",
        overdraftLimit: "0",
      },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    await prisma.walletItemDashboard.deleteMany({ where: { userId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("accountOwned/cardOwned reflect ownership", async () => {
    expect(await repo.accountOwned(userId, accountId)).toBe(true);
    expect(await repo.accountOwned(userId, randomUUID())).toBe(false);
    expect(await repo.cardOwned(userId, randomUUID())).toBe(false);
  });

  it("create persists the wallet pin", async () => {
    const order = await repo.count(userId);
    const created = await repo.create(userId, { accountId, cardId: null, order });
    itemId = created.id;
    expect(created.toContract().accountId).toBe(accountId);
    expect(created.toContract().order).toBe(order);
  });

  it("existing detects a duplicate pin", async () => {
    expect(await repo.existing(userId, accountId, undefined)).toBe(true);
    expect(await repo.existing(userId, randomUUID(), undefined)).toBe(false);
  });

  it("list returns the user's pins ordered", async () => {
    const rows = await repo.list(userId);
    expect(rows.map((r) => r.id)).toContain(itemId);
  });

  it("reorder persists new positions scoped to the user", async () => {
    await repo.reorder(userId, [itemId]);
    const rows = await repo.list(userId);
    expect(rows[0]!.id).toBe(itemId);
  });

  it("remove deletes the pin, scoped to ownership", async () => {
    expect(await repo.remove(userId, itemId)).toBe(true);
    expect(await repo.remove(userId, itemId)).toBe(false);
  });
});

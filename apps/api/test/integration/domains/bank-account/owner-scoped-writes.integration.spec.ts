import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaTransactionWriterRepository } from "../../../../src/domains/transaction/infrastructure/prisma-transaction-writer.repository";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { buildBankAccountRepo } from "../../support/repositories";

/**
 * The writes that move money by id also match the owner: every caller already loaded the row
 * scoped by user, so this is a second lock. Someone else's account or movement makes the write
 * throw — and the caller's whole transaction rolls back — instead of moving their money.
 */
describe("money writes by id are scoped to their owner (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accounts = buildBankAccountRepo(prisma);
  const writer = new PrismaTransactionWriterRepository(prisma);
  const owner = `u_${randomUUID()}`;
  const stranger = `u_${randomUUID()}`;
  let accountId: string;
  let movementId: string;

  beforeAll(async () => {
    await prisma.$connect();
    for (const id of [owner, stranger]) {
      await prisma.user.create({
        data: { id, email: `${id}@test.local`, passwordHash: "x", name: "Test" },
      });
    }
    const account = await prisma.bankAccount.create({
      data: {
        userId: owner,
        name: "Cuenta",
        type: "CREDIT_CARD",
        currency: "CLP",
        initialBalance: "1000",
        currentBalance: "1000",
        creditLimit: "500000",
        creditUsedInitial: "0",
        creditUsed: "0",
      },
    });
    accountId = account.id;
    const movement = await prisma.transaction.create({
      data: {
        userId: owner,
        bankAccountId: accountId,
        type: "EXPENSE",
        amount: "100",
        currency: "CLP",
        occurredAt: new Date(),
      },
    });
    movementId = movement.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: { in: [owner, stranger] } } });
    await prisma.bankAccount.deleteMany({ where: { userId: { in: [owner, stranger] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  async function account() {
    return prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
  }

  it("refuses to move another user's balance, credit or opening figures", async () => {
    await expect(
      prisma.$transaction((tx) => accounts.incrementBalanceWithTx(tx, stranger, accountId, "-50")),
    ).rejects.toThrow();
    await expect(
      prisma.$transaction((tx) =>
        accounts.incrementCreditUsedWithTx(tx, stranger, accountId, "50"),
      ),
    ).rejects.toThrow();
    await expect(
      prisma.$transaction((tx) =>
        accounts.adjustOpeningWithTx(tx, stranger, accountId, "-50", "50"),
      ),
    ).rejects.toThrow();

    const row = await account();
    expect(row.currentBalance.toString()).toBe("1000");
    expect(row.creditUsed.toString()).toBe("0");
    expect(row.initialBalance.toString()).toBe("1000");
    expect(row.creditUsedInitial.toString()).toBe("0");
  });

  it("refuses to change or delete another user's movement", async () => {
    await expect(
      prisma.$transaction((tx) => writer.updateAmountWithTx(tx, stranger, movementId, "1")),
    ).rejects.toThrow();
    await expect(
      prisma.$transaction((tx) => writer.deleteWithTx(tx, stranger, movementId)),
    ).rejects.toThrow();

    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: movementId } });
    expect(row.amount.toString()).toBe("100");
  });

  it("still writes for the owner", async () => {
    await prisma.$transaction((tx) => accounts.incrementBalanceWithTx(tx, owner, accountId, "-50"));
    await prisma.$transaction((tx) => writer.updateAmountWithTx(tx, owner, movementId, "150"));

    expect((await account()).currentBalance.toString()).toBe("950");
    const row = await prisma.transaction.findUniqueOrThrow({ where: { id: movementId } });
    expect(row.amount.toString()).toBe("150");
  });
});

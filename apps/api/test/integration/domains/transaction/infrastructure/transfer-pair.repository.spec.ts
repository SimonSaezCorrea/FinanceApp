import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EXCLUDE_TRANSFERS } from "../../../../../src/domains/transaction/application/queries/transaction-list-filter";
import { PrismaTransactionRepository } from "../../../../../src/domains/transaction/infrastructure/prisma-transaction.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";
import { buildBankAccountRepo, buildCardAccountRepo } from "../../../support/repositories";

/** Real-test-DB integration test — needs a reachable Postgres (`pnpm db:reset`). */
describe("transfer pair (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const txRepo = new PrismaTransactionRepository(prisma, accountRepo);
  const userId = `u_${randomUUID()}`;
  let a1 = "";
  let a2 = "";
  let a3 = "";

  const makeAccount = async (name: string, initialBalance: string) => {
    const account = await accountRepo.createWithCards(userId, {
      name,
      type: "CHECKING",
      status: "ACTIVE",
      currency: "CLP",
      institution: null,
      institutionId: null,
      accountNumber: "1234",
      accountAlias: null,
      initialBalance,
      overdraftLimit: "0",
      balanceCeiling: null,
      creditLimit: "0",
      creditUsedInitial: "0",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [],
    });
    return account.id;
  };

  const balanceOf = async (id: string) =>
    (await prisma.bankAccount.findUniqueOrThrow({ where: { id } })).currentBalance.toString();

  const leg = (over: Record<string, unknown>) => ({
    userId,
    type: "EXPENSE" as const,
    amount: "1000",
    currency: "CLP",
    occurredAt: new Date("2026-08-01"),
    category: null,
    description: null,
    observation: null,
    emisor: null,
    receptor: null,
    lugar: null,
    bankAccountId: a1,
    cardId: null,
    financeCharge: false,
    installmentPlanId: null,
    creditStatementId: null,
    transferGroupId: "",
    debtId: null,
    recurringExpenseId: null,
    ...over,
  });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    a1 = await makeAccount("Origen", "10000");
    a2 = await makeAccount("Destino", "0");
    a3 = await makeAccount("Otro destino", "0");
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("creates both legs and moves both balances atomically", async () => {
    const groupId = randomUUID();
    const pair = await txRepo.saveTransferPair(
      userId,
      leg({ transferGroupId: groupId }),
      leg({ type: "INCOME", bankAccountId: a2, transferGroupId: groupId }),
      [
        { accountId: a1, delta: "-1000" },
        { accountId: a2, delta: "1000" },
      ],
    );

    expect(pair.outgoing.bankAccountId).toBe(a1);
    expect(pair.incoming.bankAccountId).toBe(a2);
    expect(await balanceOf(a1)).toBe("9000");
    expect(await balanceOf(a2)).toBe("1000");
  });

  it("leaves neither a stray row nor a moved balance when the write fails midway", async () => {
    const before1 = await balanceOf(a1);
    const before2 = await balanceOf(a2);
    const groupId = randomUUID();

    await expect(
      txRepo.saveTransferPair(
        userId,
        leg({ transferGroupId: groupId }),
        // A non-existent account makes the SECOND insert fail — the whole
        // `$transaction` must roll back, including the first leg.
        leg({ type: "INCOME", bankAccountId: "does-not-exist", transferGroupId: groupId }),
        [
          { accountId: a1, delta: "-1000" },
          { accountId: a2, delta: "1000" },
        ],
      ),
    ).rejects.toThrow();

    expect(await prisma.transaction.count({ where: { transferGroupId: groupId } })).toBe(0);
    expect(await balanceOf(a1)).toBe(before1);
    expect(await balanceOf(a2)).toBe(before2);
  });

  it("moving the destination adjusts all three balances", async () => {
    const groupId = randomUUID();
    await txRepo.saveTransferPair(
      userId,
      leg({ transferGroupId: groupId }),
      leg({ type: "INCOME", bankAccountId: a2, transferGroupId: groupId }),
      [
        { accountId: a1, delta: "-1000" },
        { accountId: a2, delta: "1000" },
      ],
    );
    const a1Before = await balanceOf(a1);

    await txRepo.updateTransferPair(
      userId,
      groupId,
      { amount: "1000", bankAccountId: a1 },
      { amount: "1000", bankAccountId: a3 },
      [
        { accountId: a2, delta: "-1000" },
        { accountId: a3, delta: "1000" },
      ],
    );

    const pair = await txRepo.findTransferGroup(userId, groupId);
    expect(pair?.incoming.bankAccountId).toBe(a3);
    expect(await balanceOf(a1)).toBe(a1Before);
    expect(await balanceOf(a3)).toBe("1000");
  });

  it("deleting the pair removes both rows", async () => {
    const groupId = randomUUID();
    await txRepo.saveTransferPair(
      userId,
      leg({ transferGroupId: groupId }),
      leg({ type: "INCOME", bankAccountId: a2, transferGroupId: groupId }),
      [],
    );
    expect(await txRepo.removeTransferPair(userId, groupId, [])).toBe(true);
    expect(await prisma.transaction.count({ where: { transferGroupId: groupId } })).toBe(0);
  });

  it("EXCLUDE_TRANSFERS keeps transfers out of the summary totals but not the count", async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    // One real expense…
    await prisma.transaction.create({
      data: {
        userId,
        type: "EXPENSE",
        amount: "500",
        currency: "CLP",
        occurredAt: new Date("2026-08-02"),
        category: "Comida",
        bankAccountId: a1,
      },
    });
    // …plus a transfer, which is neither income nor expense.
    const groupId = randomUUID();
    await txRepo.saveTransferPair(
      userId,
      leg({ transferGroupId: groupId, category: "Traspaso" }),
      leg({ type: "INCOME", bankAccountId: a2, transferGroupId: groupId, category: "Traspaso" }),
      [],
    );

    const summary = await txRepo.summary(userId, {});
    expect(summary.total).toBe(3);
    expect(summary.currencyTotals).toEqual([{ currency: "CLP", income: "0", expense: "500" }]);
    expect(summary.categories).toEqual(["Comida"]);
    // The predicate itself is what the summary applies.
    expect(EXCLUDE_TRANSFERS).toEqual({ transferGroupId: null });
  });
});

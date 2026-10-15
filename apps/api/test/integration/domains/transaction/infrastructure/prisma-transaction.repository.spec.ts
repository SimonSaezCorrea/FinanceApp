import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaTransactionRepository } from "../../../../../src/domains/transaction/infrastructure/prisma-transaction.repository";
import {
  buildBankAccountRepo,
  buildCardAccountRepo,
  buildCreditStatementRepo,
} from "../../../support/repositories";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

/**
 * Real-test-DB integration test (FR-016) — requires `DATABASE_URL` pointing at
 * a reachable Postgres (see `docker-compose.yml` / `pnpm db:reset`). Not part
 * of `test:unit` (SC-002/SC-005).
 */
describe("PrismaTransactionRepository (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const txRepo = new PrismaTransactionRepository(prisma, accountRepo);
  const userId = `u_${randomUUID()}`;
  let creditAccountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    const account = await accountRepo.createWithCards(userId, {
      name: "Test credit line",
      type: "CREDIT_CARD",
      status: "ACTIVE",
      currency: "CLP",
      institution: null,
      institutionId: null,
      accountNumber: undefined,
      accountAlias: null,
      initialBalance: "0",
      overdraftLimit: "0",
      balanceCeiling: null,
      creditLimit: "1000000",
      creditUsedInitial: "0",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [
        {
          name: "Main card",
          kind: "CREDIT",
          last4: "1234",
          expiryMonth: 12,
          expiryYear: 2030,
          isActive: true,
          isPrimary: true,
          isVirtual: false,
          isAdditional: false,
          cardholderName: null,
          network: null,
          limits: [],
        },
      ],
    });
    creditAccountId = account.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.creditStatement.deleteMany({ where: { account: { userId } } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("the account's rule-relevant context comes from the bank-account port", async () => {
    const account = await accountRepo.findById(userId, creditAccountId);
    expect(account?.type).toBe("CREDIT_CARD");
    expect(account?.creditLimit).toBe("1000000.0000");
  });

  it("findOrCreateOpenForAccount creates one, then reuses it", async () => {
    const first = await statementRepo.findOrCreateOpenForAccount(
      creditAccountId,
      new Date(),
      "CLP",
    );
    const second = await statementRepo.findOrCreateOpenForAccount(
      creditAccountId,
      new Date(),
      "CLP",
    );
    expect(second.id).toBe(first.id);
  });

  it("saveNew creates the transaction and atomically increments creditUsed", async () => {
    const stmt = await statementRepo.findOrCreateOpenForAccount(creditAccountId, new Date(), "CLP");
    const created = await txRepo.saveNew(
      userId,
      {
        userId,
        type: "EXPENSE",
        amount: "50000",
        currency: "CLP",
        occurredAt: new Date(),
        categoryId: null,
        description: null,
        observation: null,
        emisor: null,
        receptor: null,
        lugar: null,
        bankAccountId: creditAccountId,
        cardId: null,
        financeCharge: false,
        installmentPlanId: null,
        transferGroupId: null,
        creditStatementId: stmt.id,
        debtId: null,
        recurringExpenseId: null,
        savingsEntryId: null,
        savingsGoalId: null,
        prepaymentStatementId: null,
        prepaymentAccountId: null,
        settlesStatementId: null,
      },
      { accountId: creditAccountId, delta: "50000" },
      [],
    );
    expect(created.amount).toBe("50000.0000");
    const account = await accountRepo.findById(userId, creditAccountId);
    expect(account?.creditUsed).toBe("50000.0000");
  });

  it("removeWithCreditAdjustment deletes the row and reverts the delta", async () => {
    const stmt = await statementRepo.findOrCreateOpenForAccount(creditAccountId, new Date(), "CLP");
    const created = await txRepo.saveNew(
      userId,
      {
        userId,
        type: "EXPENSE",
        amount: "10000",
        currency: "CLP",
        occurredAt: new Date(),
        categoryId: null,
        description: null,
        observation: null,
        emisor: null,
        receptor: null,
        lugar: null,
        bankAccountId: creditAccountId,
        cardId: null,
        financeCharge: false,
        installmentPlanId: null,
        transferGroupId: null,
        creditStatementId: stmt.id,
        debtId: null,
        recurringExpenseId: null,
        savingsEntryId: null,
        savingsGoalId: null,
        prepaymentStatementId: null,
        prepaymentAccountId: null,
        settlesStatementId: null,
      },
      { accountId: creditAccountId, delta: "10000" },
      [],
    );
    const before = await accountRepo.findById(userId, creditAccountId);
    const removed = await txRepo.removeWithCreditAdjustment(
      userId,
      created.id,
      { accountId: creditAccountId, delta: "-10000" },
      [],
    );
    expect(removed).toBe(true);
    const after = await accountRepo.findById(userId, creditAccountId);
    expect(after?.creditUsed).toBe(String(Number(before!.creditUsed) - 10000) + ".0000");
    expect(await txRepo.findOne(userId, created.id)).toBeNull();
  });

  it("sumsForCard counts an old charge of a closed, unpaid period — until that period is paid", async () => {
    const card = await prisma.cardAccount.findFirstOrThrow({
      where: { accountId: creditAccountId },
    });
    const day = 24 * 60 * 60 * 1000;
    const owed = async () =>
      Number((await txRepo.sumsForCard(userId, card.id, "CLP", undefined, true)).expense);
    const before = await owed();

    // A period that closed two months ago and was never paid: its charges are still owed, no
    // matter how long ago they happened (no billing-cycle window, 2026-10-14).
    const statement = await prisma.creditStatement.create({
      data: {
        accountId: creditAccountId,
        currency: "CLP",
        periodStart: new Date(Date.now() - 100 * day),
        closedAt: new Date(Date.now() - 60 * day),
      },
    });
    await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: creditAccountId,
        cardId: card.id,
        type: "EXPENSE",
        amount: "50000",
        currency: "CLP",
        occurredAt: new Date(Date.now() - 90 * day),
        creditStatementId: statement.id,
      },
    });
    expect(await owed()).toBe(before + 50000);

    // Paying the account's statement frees it: the card's sub-limit follows the account.
    await prisma.creditStatement.update({
      where: { id: statement.id },
      data: { paidAt: new Date(), paidAmount: "50000", amount: "50000" },
    });
    expect(await owed()).toBe(before);
  });
});

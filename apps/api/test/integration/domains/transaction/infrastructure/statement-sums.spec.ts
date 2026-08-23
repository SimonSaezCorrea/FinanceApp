import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaTransactionSumsRepository } from "../../../../../src/domains/transaction/infrastructure/prisma-transaction-sums.repository";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";
import { buildBankAccountRepo, buildCreditStatementRepo } from "../../../support/repositories";

/**
 * Spec 014, FR-007 — the highest-risk item in the whole feature.
 *
 * A plan's purchase movement carries `installmentPlanId`, sits on the credit account,
 * and is linked to whatever period was open when it was created. If the period sums
 * counted it, one month's statement would charge the ENTIRE purchase (1.080.000)
 * instead of one instalment (90.000) — precisely the defect this feature exists to
 * remove. It has to be excluded at the REPOSITORY level, not only end to end, because
 * every read of a period's total goes through here.
 *
 * The interest charge (`financeCharge`, no `installmentPlanId`) is the control: it is
 * an ordinary period charge and MUST keep counting.
 */
describe("statement sums exclude a plan's purchase movement (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const sums = new PrismaTransactionSumsRepository(prisma);
  const userId = `u_${randomUUID()}`;
  let accountId: string;
  let cardId: string;
  let planId: string;
  let statementId: string;

  const PERIOD_START = new Date("2026-03-01T00:00:00.000Z");
  const OCCURRED = new Date("2026-03-05T00:00:00.000Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    const account = await accountRepo.createWithCards(userId, {
      name: "CMR Visa",
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
      creditLimit: "2000000",
      creditUsedInitial: "0",
      billingCycleDay: 5,
      paymentMethod: "MANUAL",
      cards: [
        {
          name: "CMR Visa",
          kind: "CREDIT",
          last4: "4827",
          expiryMonth: 12,
          expiryYear: 2030,
          isActive: true,
          isPrimary: true,
          isVirtual: false,
          isAdditional: false,
          cardholderName: null,
          network: "VISA",
          limits: [],
        },
      ],
    });
    accountId = account.id;
    cardId = account.cards[0].id;

    const plan = await prisma.installmentPlan.create({
      data: {
        userId,
        title: "Notebook ASUS",
        totalPrincipal: "1080000",
        installmentCount: 12,
        startDate: OCCURRED,
        currency: "CLP",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        cardId,
      },
    });
    planId = plan.id;

    const statement = await statementRepo.findOrCreateOpenForAccount(accountId, PERIOD_START);
    statementId = statement.id;

    // 1. The plan's purchase: the whole commitment, linked to the open period.
    await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: accountId,
        cardId,
        type: "EXPENSE",
        amount: "1080000",
        currency: "CLP",
        occurredAt: OCCURRED,
        installmentPlanId: planId,
        creditStatementId: statementId,
      },
    });
    // 2. An ordinary purchase on the same card, same period.
    await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: accountId,
        cardId,
        type: "EXPENSE",
        amount: "40000",
        currency: "CLP",
        occurredAt: OCCURRED,
        creditStatementId: statementId,
      },
    });
    // 3. The issuer's interest charge: no card, no plan id — an ordinary charge.
    await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: accountId,
        type: "EXPENSE",
        amount: "5000",
        currency: "CLP",
        occurredAt: OCCURRED,
        financeCharge: true,
        creditStatementId: statementId,
      },
    });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.installmentPayment.deleteMany({ where: { plan: { userId } } });
    await prisma.installmentPlan.deleteMany({ where: { userId } });
    await prisma.creditStatement.deleteMany({ where: { account: { userId } } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("netForStatement skips the purchase movement and keeps the rest", async () => {
    // 40.000 (ordinary) + 5.000 (interest) = 45.000. The 1.080.000 purchase is NOT here.
    // This is what `CreditStatement.totalFor` is fed for an unsettled period.
    expect(await sums.netForStatement(statementId)).toBe("45000");
  });

  it("netForPeriod skips it too, so reconciling a period cannot resurrect it", async () => {
    // `sync` recomputes a period from its DATE WINDOW rather than its links, so the
    // exclusion has to hold on both paths or reconciliation would put the purchase back.
    // `cardIds: null` = a CREDIT_CARD account, where every movement is a credit-line
    // one by construction.
    const net = await sums.netForPeriod({
      accountId,
      cardIds: null,
      from: PERIOD_START,
      to: new Date("2026-04-01T00:00:00.000Z"),
    });
    expect(net).toBe("45000");
  });

  it("the purchase movement still exists and still belongs to the card", async () => {
    // Excluded from the period's TOTAL, never hidden: FR-023 requires it to show up
    // when Movements is filtered by this card, and it is what consumes the pool.
    const rows = await prisma.transaction.findMany({
      where: { userId, installmentPlanId: planId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].cardId).toBe(cardId);
    expect(rows[0].amount.toString()).toBe("1080000");
  });
});

import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GenerateStatementsCommand } from "../../../../../src/domains/credit-statement/application/commands/generate-statements.command";
import { GenerateStatementsHandler } from "../../../../../src/domains/credit-statement/application/commands/generate-statements.handler";
import { PayCreditStatementCommand } from "../../../../../src/domains/credit-statement/application/commands/pay-credit-statement.command";
import { PayCreditStatementHandler } from "../../../../../src/domains/credit-statement/application/commands/pay-credit-statement.handler";
import { UpdateStatementPaymentCommand } from "../../../../../src/domains/credit-statement/application/commands/update-statement-payment.command";
import { UpdateStatementPaymentHandler } from "../../../../../src/domains/credit-statement/application/commands/update-statement-payment.handler";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";
import {
  buildBankAccountRepo,
  buildCreditStatementRepo,
  buildIdempotencyRecordRepo,
  buildInstallmentPlanRepo,
  buildTransactionWriterRepo,
} from "../../../support/repositories";

/**
 * Spec 014, US3 — paying a period settles the instalments it charged, and the pool
 * moves by exactly what was paid (never twice). Requires a reachable Postgres.
 */
describe("PayCreditStatementHandler settles instalments (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const planRepo = buildInstallmentPlanRepo(prisma);
  const userId = `u_${randomUUID()}`;
  let creditAccountId: string;
  let fromAccountId: string;
  let planId: string;
  let statementId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    const creditAccount = await accountRepo.createWithCards(userId, {
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
    creditAccountId = creditAccount.id;
    const cardId = creditAccount.cards[0].id;

    const fromAccount = await accountRepo.createWithCards(userId, {
      name: "Cuenta Corriente",
      type: "CHECKING",
      status: "ACTIVE",
      currency: "CLP",
      institution: null,
      institutionId: null,
      accountNumber: "123",
      accountAlias: null,
      initialBalance: "1000000",
      overdraftLimit: "0",
      balanceCeiling: null,
      creditLimit: "0",
      creditUsedInitial: "0",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [],
    });
    fromAccountId = fromAccount.id;

    const plan = await prisma.installmentPlan.create({
      data: {
        userId,
        title: "Notebook ASUS",
        totalPrincipal: "1080000",
        installmentCount: 12,
        startDate: new Date("2026-01-05T00:00:00.000Z"),
        currency: "CLP",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        cardId,
      },
    });
    planId = plan.id;
    await prisma.installmentPayment.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        installmentPlanId: planId,
        sequence: i + 1,
        dueDate: new Date(Date.UTC(2026, i, 5)),
        amount: "90000",
      })),
    });

    // The instalment's purchase movement, as create-installment-plan.handler would
    // write it: consumes the pool, carries installmentPlanId, excluded from period
    // totals.
    await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: creditAccountId,
        cardId,
        type: "EXPENSE",
        amount: "1080000",
        currency: "CLP",
        occurredAt: new Date("2026-01-05T00:00:00.000Z"),
        installmentPlanId: planId,
      },
    });
    await accountRepo.incrementCreditUsedWithTx(prisma, creditAccountId, "1080000");

    // An ordinary purchase (40.000) in the same period, plus close+stamp the first
    // instalment (90.000) — a period totalling 130.000.
    const statement = await statementRepo.findOrCreateOpenForAccount(
      creditAccountId,
      new Date("2026-01-01T00:00:00.000Z"),
    );
    statementId = statement.id;
    await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: creditAccountId,
        cardId,
        type: "EXPENSE",
        amount: "40000",
        currency: "CLP",
        occurredAt: new Date("2026-01-06T00:00:00.000Z"),
        creditStatementId: statementId,
      },
    });
    await accountRepo.incrementCreditUsedWithTx(prisma, creditAccountId, "40000");

    const generateHandler = new GenerateStatementsHandler(
      { publish: () => undefined } as never,
      accountRepo,
      statementRepo,
      planRepo,
      prisma,
    );
    await generateHandler.execute(new GenerateStatementsCommand(userId, creditAccountId));
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.installmentPayment.deleteMany({ where: { plan: { userId } } });
    await prisma.installmentPlan.deleteMany({ where: { userId } });
    await prisma.creditStatement.deleteMany({ where: { accountId: { in: [creditAccountId] } } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("paying the period settles its instalment and moves the pool by exactly what was paid", async () => {
    const before = await accountRepo.findById(userId, creditAccountId);
    expect(before?.creditUsed).toBe("1120000.0000"); // 1.080.000 + 40.000, nothing more yet

    const payHandler = new PayCreditStatementHandler(
      { publish: () => undefined } as never,
      buildIdempotencyRecordRepo(prisma),
      accountRepo,
      statementRepo,
      buildTransactionWriterRepo(prisma),
      planRepo,
      prisma,
    );
    await payHandler.execute(
      new PayCreditStatementCommand(
        userId,
        creditAccountId,
        statementId,
        fromAccountId,
        randomUUID(),
      ),
    );

    const instalment1 = await prisma.installmentPayment.findFirst({
      where: { installmentPlanId: planId, sequence: 1 },
    });
    expect(instalment1?.paidAt).not.toBeNull();
    expect(instalment1?.paidAmount?.toString()).toBe("90000");

    // The pool dropped by exactly 130.000 (the period paid) — NOT by 130.000 +
    // 90.000 = 220.000, which is what a double-discount bug would produce.
    const after = await accountRepo.findById(userId, creditAccountId);
    expect(after?.creditUsed).toBe("990000.0000");
  });

  it("correcting the settled payment leaves the instalment's status untouched", async () => {
    const before = await prisma.installmentPayment.findFirst({
      where: { installmentPlanId: planId, sequence: 1 },
    });

    const updateHandler = new UpdateStatementPaymentHandler(
      { publish: () => undefined } as never,
      statementRepo,
      accountRepo,
      buildTransactionWriterRepo(prisma),
      prisma,
    );
    await updateHandler.execute(
      new UpdateStatementPaymentCommand(userId, creditAccountId, statementId, "100000"),
    );

    const after = await prisma.installmentPayment.findFirst({
      where: { installmentPlanId: planId, sequence: 1 },
    });
    expect(after?.paidAt).toEqual(before?.paidAt);
    expect(after?.paidAmount?.toString()).toBe(before?.paidAmount?.toString());
    expect(after?.creditStatementId).toBe(before?.creditStatementId);
  });
});

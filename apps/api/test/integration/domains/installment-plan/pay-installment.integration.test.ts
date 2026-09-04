import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PayInstallmentCommand } from "../../../../src/domains/installment-plan/application/commands/pay-installment.command";
import { PayInstallmentHandler } from "../../../../src/domains/installment-plan/application/commands/pay-installment.handler";
import { UnpayInstallmentCommand } from "../../../../src/domains/installment-plan/application/commands/unpay-installment.command";
import { UnpayInstallmentHandler } from "../../../../src/domains/installment-plan/application/commands/unpay-installment.handler";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import {
  buildBankAccountRepo,
  buildCardAccountRepo,
  buildIdempotencyRecordRepo,
  buildInstallmentPlanRepo,
  buildTransactionWriterRepo,
} from "../../support/repositories";

/**
 * Paying an instalment against a real database (FR-019a).
 *
 * The point of this tier is the ATOMICITY the unit tier cannot show: the expense, the
 * balance, the instalment and the carry-over land together — and when any one of them
 * fails, NONE of them survives. A half-applied payment is the one outcome that leaves
 * the books wrong with nothing to detect it.
 */
describe("PayInstallmentHandler (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const planRepo = buildInstallmentPlanRepo(prisma);
  const accounts = buildBankAccountRepo(prisma);
  const cards = buildCardAccountRepo(prisma);
  const transactions = buildTransactionWriterRepo(prisma);
  const eventBus = { publish: vi.fn() } as never;

  const userId = `u_${randomUUID()}`;
  let accountId: string;
  let planId: string;

  const idempotencyRecords = buildIdempotencyRecordRepo(prisma);

  const handler = () =>
    new PayInstallmentHandler(
      eventBus,
      idempotencyRecords,
      prisma,
      planRepo,
      accounts,
      cards,
      transactions,
    );

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.installmentPlan.deleteMany({ where: { userId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.installmentPlan.deleteMany({ where: { userId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });

    const account = await prisma.bankAccount.create({
      data: {
        userId,
        name: "Cuenta Corriente",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "123456",
        initialBalance: "1000000",
        currentBalance: "1000000",
      },
    });
    accountId = account.id;

    const plan = await planRepo.create(userId, {
      title: "Notebook",
      totalPrincipal: "120000",
      installmentCount: 3,
      startDate: new Date("2026-01-15T00:00:00.000Z"),
      currency: "CLP",
      frequency: "MONTHLY",
      frequencyInterval: 1,
      cardId: null,
      category: "Tecnología",
      paymentAccountId: accountId,
      notes: null,
      payments: [
        { sequence: 1, dueDate: new Date("2026-01-15"), amount: "40000" },
        { sequence: 2, dueDate: new Date("2026-02-15"), amount: "40000" },
        { sequence: 3, dueDate: new Date("2026-03-15"), amount: "40000" },
      ],
    });
    planId = plan.id;
  });

  it("records the expense, moves the balance and marks the instalment, all at once", async () => {
    await handler().execute(
      new PayInstallmentCommand(
        userId,
        planId,
        1,
        accountId,
        null,
        null,
        new Date("2026-01-16"),
        randomUUID(),
      ),
    );

    const movements = await prisma.transaction.findMany({ where: { userId } });
    expect(movements).toHaveLength(1);
    expect(Number(movements[0]!.amount)).toBe(40000.0);
    expect(movements[0]!.type).toBe("EXPENSE");
    // Recognisable in Movements as this plan's instalment (FR-027).
    expect(movements[0]!.installmentPlanId).toBe(planId);
    expect(movements[0]!.category).toBe("Tecnología");

    const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(Number(account.currentBalance)).toBe(960000.0);

    const payment = await prisma.installmentPayment.findFirstOrThrow({
      where: { installmentPlanId: planId, sequence: 1 },
    });
    expect(payment.paidAt).not.toBeNull();
    expect(Number(payment.paidAmount)).toBe(40000.0);
    expect(payment.transactionId).toBe(movements[0]!.id);
  });

  it("carries the shortfall of a short payment onto the next instalment", async () => {
    await handler().execute(
      new PayInstallmentCommand(
        userId,
        planId,
        1,
        accountId,
        "30000",
        null,
        new Date("2026-01-16"),
        randomUUID(),
      ),
    );

    const [first, second] = await prisma.installmentPayment.findMany({
      where: { installmentPlanId: planId },
      orderBy: { sequence: "asc" },
    });
    // The instalment is settled and the schedule untouched (FR-020): what moved is
    // the successor's carry-over, a figure of its own.
    expect(first!.paidAt).not.toBeNull();
    expect(Number(first!.paidAmount)).toBe(30000.0);
    expect(Number(second!.amount)).toBe(40000.0);
    expect(Number(second!.carriedOverAmount)).toBe(10000.0);

    // Only what was really paid left the account.
    const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(Number(account.currentBalance)).toBe(970000.0);
  });

  it("leaves nothing behind when a step of the payment fails", async () => {
    // The instalment write blows up AFTER the expense and the balance were written
    // inside the same transaction — exactly the half-applied state the transaction
    // exists to prevent.
    const broken = {
      ...planRepo,
      findOne: planRepo.findOne.bind(planRepo),
      savePaymentWithTx: async () => {
        throw new Error("boom");
      },
    } as unknown as typeof planRepo;

    const failing = new PayInstallmentHandler(
      eventBus,
      idempotencyRecords,
      prisma,
      broken,
      accounts,
      cards,
      transactions,
    );

    await expect(
      failing.execute(
        new PayInstallmentCommand(
          userId,
          planId,
          1,
          accountId,
          null,
          null,
          new Date("2026-01-16"),
          randomUUID(),
        ),
      ),
    ).rejects.toThrow("boom");

    expect(await prisma.transaction.count({ where: { userId } })).toBe(0);
    const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(Number(account.currentBalance)).toBe(1000000.0);
    const payment = await prisma.installmentPayment.findFirstOrThrow({
      where: { installmentPlanId: planId, sequence: 1 },
    });
    expect(payment.paidAt).toBeNull();
  });

  it("undoing gives the money back and clears the instalment", async () => {
    await handler().execute(
      new PayInstallmentCommand(
        userId,
        planId,
        1,
        accountId,
        "30000",
        null,
        new Date("2026-01-16"),
        randomUUID(),
      ),
    );
    await new UnpayInstallmentHandler(
      eventBus,
      prisma,
      planRepo,
      accounts,
      cards,
      transactions,
    ).execute(new UnpayInstallmentCommand(userId, planId, 1));

    expect(await prisma.transaction.count({ where: { userId } })).toBe(0);
    const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(Number(account.currentBalance)).toBe(1000000.0);
    const [first, second] = await prisma.installmentPayment.findMany({
      where: { installmentPlanId: planId },
      orderBy: { sequence: "asc" },
    });
    expect(first!.paidAt).toBeNull();
    expect(first!.paidAmount).toBeNull();
    // The carry that payment caused is reversed with it (FR-024).
    expect(Number(second!.carriedOverAmount)).toBe(0.0);
  });
});

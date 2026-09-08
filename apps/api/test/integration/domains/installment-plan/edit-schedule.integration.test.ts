import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PayInstallmentCommand } from "../../../../src/domains/installment-plan/application/commands/pay-installment.command";
import { PayInstallmentHandler } from "../../../../src/domains/installment-plan/application/commands/pay-installment.handler";
import { UpdateInstallmentPlanCommand } from "../../../../src/domains/installment-plan/application/commands/update-installment-plan.command";
import { UpdateInstallmentPlanHandler } from "../../../../src/domains/installment-plan/application/commands/update-installment-plan.handler";
import { InstallmentPlanScheduleLockedError } from "../../../../src/domains/installment-plan/domain/errors";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import {
  buildBankAccountRepo,
  buildCardAccountRepo,
  buildIdempotencyRecordRepo,
  buildInstallmentPlanRepo,
  buildTransactionWriterRepo,
} from "../../support/repositories";

/**
 * Editing a plan's schedule (total/count/start date) is allowed only while
 * nothing on it is real history yet — regenerates the whole calendar from
 * scratch, and, for a CREDIT-card plan, keeps its purchase movement and the
 * account's credit pool in step with the new total.
 */
describe("editing an installment plan's schedule (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const planRepo = buildInstallmentPlanRepo(prisma);
  const accounts = buildBankAccountRepo(prisma);
  const cards = buildCardAccountRepo(prisma);
  const transactions = buildTransactionWriterRepo(prisma);
  const eventBus = { publish: vi.fn() } as never;

  const userId = `u_${randomUUID()}`;

  function updateHandler() {
    return new UpdateInstallmentPlanHandler(eventBus, planRepo, cards, accounts, transactions, prisma);
  }

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
  });

  it("regenerates the whole schedule while nothing has been paid yet", async () => {
    const account = await prisma.bankAccount.create({
      data: {
        userId,
        name: "Cuenta Corriente",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "1",
        initialBalance: "500000",
        currentBalance: "500000",
      },
    });

    const plan = await planRepo.create(userId, {
      title: "Curso de inglés",
      totalPrincipal: "240000",
      installmentCount: 6,
      startDate: new Date("2026-01-31T00:00:00.000Z"),
      currency: "CLP",
      frequency: "MONTHLY",
      frequencyInterval: 1,
      cardId: null,
      category: "Educación",
      paymentAccountId: account.id,
      notes: null,
      payments: Array.from({ length: 6 }, (_, i) => ({
        sequence: i + 1,
        dueDate: new Date(Date.UTC(2026, i, 31)),
        amount: "40000",
      })),
    });

    const result = await updateHandler().execute(
      new UpdateInstallmentPlanCommand(userId, plan.id, {
        totalPrincipal: "300000",
        installmentCount: 5,
        startDate: new Date("2026-03-01T00:00:00.000Z").toISOString(),
      }),
    );

    expect(result.totalPrincipal).toBe("300000.0000");
    expect(result.installmentCount).toBe(5);
    expect(result.payments).toHaveLength(5);
    expect(result.payments.every((p) => p.amount === "60000.0000")).toBe(true);
    expect(result.payments.every((p) => p.paidAt === null)).toBe(true);
    expect(new Date(result.payments[0]!.dueDate).toISOString().slice(0, 10)).toBe("2026-03-01");

    const rows = await prisma.installmentPayment.findMany({
      where: { installmentPlanId: plan.id },
    });
    expect(rows).toHaveLength(5);
  });

  it("refuses once an instalment has been paid", async () => {
    const account = await prisma.bankAccount.create({
      data: {
        userId,
        name: "Cuenta Corriente",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "1",
        initialBalance: "500000",
        currentBalance: "500000",
      },
    });

    const plan = await planRepo.create(userId, {
      title: "Refrigerador",
      totalPrincipal: "90000",
      installmentCount: 3,
      startDate: new Date("2026-01-10T00:00:00.000Z"),
      currency: "CLP",
      frequency: "MONTHLY",
      frequencyInterval: 1,
      cardId: null,
      category: null,
      paymentAccountId: account.id,
      notes: null,
      payments: [
        { sequence: 1, dueDate: new Date("2026-01-10"), amount: "30000" },
        { sequence: 2, dueDate: new Date("2026-02-10"), amount: "30000" },
        { sequence: 3, dueDate: new Date("2026-03-10"), amount: "30000" },
      ],
    });

    await new PayInstallmentHandler(
      eventBus,
      buildIdempotencyRecordRepo(prisma),
      prisma,
      planRepo,
      accounts,
      cards,
      transactions,
    ).execute(
      new PayInstallmentCommand(
        userId,
        plan.id,
        1,
        account.id,
        null,
        null,
        new Date("2026-01-11"),
        randomUUID(),
      ),
    );

    await expect(
      updateHandler().execute(
        new UpdateInstallmentPlanCommand(userId, plan.id, { totalPrincipal: "120000" }),
      ),
    ).rejects.toBeInstanceOf(InstallmentPlanScheduleLockedError);

    // Untouched: still 3 rows at the original amount.
    const rows = await prisma.installmentPayment.findMany({
      where: { installmentPlanId: plan.id },
      orderBy: { sequence: "asc" },
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.amount.toString())).toEqual(["30000", "30000", "30000"]);
  });

  it("keeps a CREDIT-card plan's purchase movement and the pool in step with the new total", async () => {
    const creditAccount = await accounts.createWithCards(userId, {
      name: "Visa Crédito",
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
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [
        {
          name: "Visa Crédito",
          kind: "CREDIT",
          last4: "1234",
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
    const cardId = creditAccount.cards[0]!.id;

    const plan = await prisma.installmentPlan.create({
      data: {
        userId,
        title: "Notebook",
        totalPrincipal: "600000",
        installmentCount: 6,
        startDate: new Date("2026-01-05T00:00:00.000Z"),
        currency: "CLP",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        cardId,
      },
    });
    await prisma.installmentPayment.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        installmentPlanId: plan.id,
        sequence: i + 1,
        dueDate: new Date(Date.UTC(2026, i, 5)),
        amount: "100000",
      })),
    });
    const purchase = await prisma.transaction.create({
      data: {
        userId,
        bankAccountId: creditAccount.id,
        cardId,
        type: "EXPENSE",
        amount: "600000",
        currency: "CLP",
        occurredAt: new Date("2026-01-05T00:00:00.000Z"),
        installmentPlanId: plan.id,
      },
    });
    await accounts.incrementCreditUsedWithTx(prisma, creditAccount.id, "600000");

    await updateHandler().execute(
      new UpdateInstallmentPlanCommand(userId, plan.id, { totalPrincipal: "900000" }),
    );

    const updatedPurchase = await prisma.transaction.findUniqueOrThrow({
      where: { id: purchase.id },
    });
    expect(updatedPurchase.amount.toString()).toBe("900000");

    const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: creditAccount.id } });
    // 600.000 (original) + 300.000 (delta) = 900.000 used.
    expect(account.creditUsed.toString()).toBe("900000");
  });
});

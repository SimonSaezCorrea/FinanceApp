import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PayInstallmentCommand } from "../../../../src/domains/installment-plan/application/commands/pay-installment.command";
import { PayInstallmentHandler } from "../../../../src/domains/installment-plan/application/commands/pay-installment.handler";
import { UpdateInstallmentPlanCommand } from "../../../../src/domains/installment-plan/application/commands/update-installment-plan.command";
import { UpdateInstallmentPlanHandler } from "../../../../src/domains/installment-plan/application/commands/update-installment-plan.handler";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import {
  buildBankAccountRepo,
  buildCardAccountRepo,
  buildInstallmentPlanRepo,
  buildTransactionWriterRepo,
} from "../../support/repositories";

/**
 * SC-007 / FR-033: changing the plan's remembered payment account affects the NEXT
 * payment and nothing else.
 *
 * Worth its own test because the tempting implementation — "the plan's account is
 * where its instalments were paid from" — would silently rewrite history the moment
 * the user switches banks: expenses moved to an account that never paid them, and two
 * balances wrong at once.
 */
describe("changing a plan's payment account (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const planRepo = buildInstallmentPlanRepo(prisma);
  const accounts = buildBankAccountRepo(prisma);
  const cards = buildCardAccountRepo(prisma);
  const transactions = buildTransactionWriterRepo(prisma);
  const eventBus = { publish: vi.fn() } as never;

  const userId = `u_${randomUUID()}`;
  let firstAccountId: string;
  let secondAccountId: string;
  let planId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    const first = await prisma.bankAccount.create({
      data: {
        userId,
        name: "Cuenta A",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "1",
        initialBalance: "500000",
        currentBalance: "500000",
      },
    });
    const second = await prisma.bankAccount.create({
      data: {
        userId,
        name: "Cuenta B",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "2",
        initialBalance: "500000",
        currentBalance: "500000",
      },
    });
    firstAccountId = first.id;
    secondAccountId = second.id;

    const plan = await planRepo.create(userId, {
      title: "Bicicleta",
      totalPrincipal: "60000",
      installmentCount: 3,
      startDate: new Date("2026-01-10T00:00:00.000Z"),
      currency: "CLP",
      frequency: "MONTHLY",
      frequencyInterval: 1,
      cardId: null,
      category: null,
      paymentAccountId: firstAccountId,
      notes: null,
      payments: [
        { sequence: 1, dueDate: new Date("2026-01-10"), amount: "20000" },
        { sequence: 2, dueDate: new Date("2026-02-10"), amount: "20000" },
        { sequence: 3, dueDate: new Date("2026-03-10"), amount: "20000" },
      ],
    });
    planId = plan.id;

    await new PayInstallmentHandler(
      eventBus,
      prisma,
      planRepo,
      accounts,
      cards,
      transactions,
    ).execute(
      new PayInstallmentCommand(
        userId,
        planId,
        1,
        firstAccountId,
        null,
        null,
        new Date("2026-01-11"),
      ),
    );
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.installmentPlan.deleteMany({ where: { userId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("leaves the expenses and the balances already recorded exactly as they were", async () => {
    const before = await prisma.transaction.findMany({ where: { userId } });

    await new UpdateInstallmentPlanHandler(eventBus, planRepo, cards).execute(
      new UpdateInstallmentPlanCommand(userId, planId, { paymentAccountId: secondAccountId }),
    );

    const after = await prisma.transaction.findMany({ where: { userId } });
    expect(after).toHaveLength(before.length);
    expect(after[0]!.bankAccountId).toBe(firstAccountId);
    expect(Number(after[0]!.amount)).toBe(Number(before[0]!.amount));
    expect(after[0]!.occurredAt.toISOString()).toBe(before[0]!.occurredAt.toISOString());

    const a = await prisma.bankAccount.findUniqueOrThrow({ where: { id: firstAccountId } });
    const b = await prisma.bankAccount.findUniqueOrThrow({ where: { id: secondAccountId } });
    // The account that paid is still 20.000 down; the new one has not been touched.
    expect(Number(a.currentBalance)).toBe(480000);
    expect(Number(b.currentBalance)).toBe(500000);

    // What DID change is the only thing that should: what the next payment offers.
    const plan = await prisma.installmentPlan.findUniqueOrThrow({ where: { id: planId } });
    expect(plan.paymentAccountId).toBe(secondAccountId);
  });
});

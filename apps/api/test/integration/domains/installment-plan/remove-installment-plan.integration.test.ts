import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PayInstallmentCommand } from "../../../../src/domains/installment-plan/application/commands/pay-installment.command";
import { PayInstallmentHandler } from "../../../../src/domains/installment-plan/application/commands/pay-installment.handler";
import { RemoveInstallmentPlanCommand } from "../../../../src/domains/installment-plan/application/commands/remove-installment-plan.command";
import { RemoveInstallmentPlanHandler } from "../../../../src/domains/installment-plan/application/commands/remove-installment-plan.handler";
import { GetInstallmentPlanQuery } from "../../../../src/domains/installment-plan/application/queries/get-installment-plan.query";
import { GetInstallmentPlanQueryHandler } from "../../../../src/domains/installment-plan/application/queries/get-installment-plan.handler";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import {
  buildBankAccountRepo,
  buildCardAccountRepo,
  buildInstallmentPlanRepo,
  buildTransactionWriterRepo,
} from "../../support/repositories";

/**
 * Deleting a plan reverses its whole money history (FR-050a) — and the impact the
 * confirmation declares beforehand (FR-050b) is that same reversal, not a second
 * estimate of it.
 *
 * Both facts are checked here together on purpose: a declared impact that does not
 * match what happens is worse than no declaration at all, since the user approved a
 * consequence that never occurred.
 */
describe("RemoveInstallmentPlanHandler (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const planRepo = buildInstallmentPlanRepo(prisma);
  const accounts = buildBankAccountRepo(prisma);
  const cards = buildCardAccountRepo(prisma);
  const transactions = buildTransactionWriterRepo(prisma);
  const eventBus = { publish: vi.fn() } as never;

  const userId = `u_${randomUUID()}`;
  let accountId: string;
  let planId: string;

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
        accountNumber: "1",
        initialBalance: "300000",
        currentBalance: "300000",
      },
    });
    accountId = account.id;

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
      paymentAccountId: accountId,
      notes: null,
      payments: [
        { sequence: 1, dueDate: new Date("2026-01-10"), amount: "30000" },
        { sequence: 2, dueDate: new Date("2026-02-10"), amount: "30000" },
        { sequence: 3, dueDate: new Date("2026-03-10"), amount: "30000" },
      ],
    });
    planId = plan.id;

    const pay = new PayInstallmentHandler(
      eventBus,
      prisma,
      planRepo,
      accounts,
      cards,
      transactions,
    );
    await pay.execute(
      new PayInstallmentCommand(userId, planId, 1, accountId, null, null, new Date("2026-01-11")),
    );
    await pay.execute(
      new PayInstallmentCommand(userId, planId, 2, accountId, null, null, new Date("2026-02-11")),
    );
  });

  it("declares an impact that matches what deleting actually does", async () => {
    const detail = await new GetInstallmentPlanQueryHandler(
      planRepo,
      cards,
      transactions,
      accounts,
    ).execute(new GetInstallmentPlanQuery(userId, planId));

    expect(detail.deletionImpact).not.toBeNull();
    expect(detail.deletionImpact!.movementCount).toBe(2);
    expect(detail.deletionImpact!.balanceRestorations).toEqual([
      { accountId, amount: "60000.0000", currency: "CLP" },
    ]);

    await new RemoveInstallmentPlanHandler(
      eventBus,
      prisma,
      planRepo,
      accounts,
      transactions,
    ).execute(new RemoveInstallmentPlanCommand(userId, planId));

    // Exactly what was promised: both movements gone, 60.000 back, plan and its
    // instalments (by cascade) gone with them.
    expect(await prisma.transaction.count({ where: { userId } })).toBe(0);
    const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(Number(account.currentBalance)).toBe(300000);
    expect(await prisma.installmentPlan.count({ where: { id: planId } })).toBe(0);
    expect(await prisma.installmentPayment.count({ where: { installmentPlanId: planId } })).toBe(0);
  });
});

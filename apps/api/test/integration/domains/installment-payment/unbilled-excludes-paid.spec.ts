import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaInstallmentPaymentRepository } from "../../../../src/domains/installment-payment/infrastructure/prisma-installment-payment.repository";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/**
 * specs/027 R7: an instalment paid without ever being billed was settled outside
 * the app (marked paid in an imported template). The next period must not charge
 * it again — while every unpaid, unbilled one due by the cut-off still is.
 */
describe("listUnbilledDueForPlans excludes instalments already paid (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const repo = new PrismaInstallmentPaymentRepository(prisma);
  const userId = `u_${randomUUID()}`;
  let planId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
    const plan = await prisma.installmentPlan.create({
      data: {
        userId,
        title: "Notebook",
        totalPrincipal: "300",
        installmentCount: 3,
        startDate: new Date("2026-01-10T00:00:00Z"),
        currency: "CLP",
      },
    });
    planId = plan.id;
    await prisma.installmentPayment.createMany({
      data: [1, 2, 3].map((sequence) => ({
        installmentPlanId: planId,
        sequence,
        dueDate: new Date(`2026-0${sequence}-10T00:00:00Z`),
        amount: "100",
        // The first one was paid outside the app; the others are pending.
        ...(sequence === 1 ? { paidAt: new Date("2026-01-15T00:00:00Z"), paidAmount: "100" } : {}),
      })),
    });
  });

  afterAll(async () => {
    await prisma.installmentPayment.deleteMany({ where: { installmentPlanId: planId } });
    await prisma.installmentPlan.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("returns only the unpaid instalments due by the cut-off", async () => {
    const rows = await repo.listUnbilledDueForPlans([planId], new Date("2026-12-31T00:00:00Z"));
    expect(rows.map((r) => r.sequence)).toEqual([2, 3]);
  });
});

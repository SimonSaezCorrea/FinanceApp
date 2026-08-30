import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GenerateStatementsCommand } from "../../../../../src/domains/credit-statement/application/commands/generate-statements.command";
import { GenerateStatementsHandler } from "../../../../../src/domains/credit-statement/application/commands/generate-statements.handler";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";
import { buildBankAccountRepo, buildCreditStatementRepo, buildInstallmentPlanRepo } from "../../../support/repositories";

/**
 * Spec 014, T027: forces a failure on the stamping half of `closeIfDue`'s
 * transaction and asserts the CLOSE is ALSO rolled back — proves atomicity, not
 * just that both writes succeed on the happy path. A period closed with its
 * instalments left unstamped would either double-bill them on the very next close
 * (the selection would still see them as due) or, worse, never get another chance
 * if this was the last cycle. Requires a reachable Postgres (real test DB).
 */
describe("GenerateStatementsHandler close+stamp transaction (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const planRepo = buildInstallmentPlanRepo(prisma);
  const userId = `u_${randomUUID()}`;
  let accountId: string;
  let cardId: string;
  let planId: string;
  let statementId: string;

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
      billingCycleType: "CALENDAR_DAY",
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

    const statement = await prisma.creditStatement.create({
      data: { accountId, periodStart: new Date("2026-01-01T00:00:00.000Z") },
      select: { id: true },
    });
    statementId = statement.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.installmentPayment.deleteMany({ where: { plan: { userId } } });
    await prisma.installmentPlan.deleteMany({ where: { userId } });
    await prisma.creditStatement.deleteMany({ where: { accountId } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("rolls back the close if stamping the instalments fails", async () => {
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      planRepo,
      prisma,
    );
    vi.spyOn(planRepo, "stampBillableWithTx").mockRejectedValueOnce(new Error("forced failure"));

    await expect(
      handler.execute(new GenerateStatementsCommand(userId, accountId)),
    ).rejects.toThrow("forced failure");

    const statement = await prisma.creditStatement.findUnique({ where: { id: statementId } });
    expect(statement?.closedAt).toBeNull(); // NOT closed — rolled back

    const billedCount = await prisma.installmentPayment.count({
      where: { installmentPlanId: planId, creditStatementId: { not: null } },
    });
    expect(billedCount).toBe(0); // nothing stamped either
  });

  it("closes and stamps together when nothing fails", async () => {
    const handler = new GenerateStatementsHandler(
      { publish: vi.fn() } as never,
      accountRepo,
      statementRepo,
      planRepo,
      prisma,
    );

    const closed = await handler.execute(new GenerateStatementsCommand(userId, accountId));
    expect(closed).toBe(true);

    const statement = await prisma.creditStatement.findUnique({ where: { id: statementId } });
    expect(statement?.closedAt).not.toBeNull();

    const billed = await prisma.installmentPayment.findMany({
      where: { installmentPlanId: planId, creditStatementId: { not: null } },
    });
    expect(billed).toHaveLength(1);
    expect(billed[0].sequence).toBe(1);
  });
});

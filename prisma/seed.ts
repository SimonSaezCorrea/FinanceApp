import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const dec = (s: string) => new Prisma.Decimal(s);

/** Demo emails: seed deletes and recreates these rows only (see auth.ts dev-credentials). */
const DEMO_EMAILS = ["demo@finance.local", "partner@finance.local"] as const;

async function main() {
  await prisma.user.deleteMany({
    where: { email: { in: [...DEMO_EMAILS] } },
  });

  await prisma.etfPriceCache.deleteMany({
    where: { symbol: "VTI" },
  });

  const alice = await prisma.user.create({
    data: {
      email: DEMO_EMAILS[0],
      name: "Demo User",
    },
  });

  const bob = await prisma.user.create({
    data: {
      email: DEMO_EMAILS[1],
      name: "Partner User",
    },
  });

  const checking = await prisma.bankAccount.create({
    data: {
      userId: alice.id,
      name: "Checking",
      institution: "Demo Bank",
      currency: "USD",
      currentBalance: dec("5420.7500"),
    },
  });

  const savingsBank = await prisma.bankAccount.create({
    data: {
      userId: alice.id,
      name: "High-yield savings",
      institution: "Demo Bank",
      currency: "USD",
      currentBalance: dec("12000.0000"),
    },
  });

  await prisma.bankAccount.create({
    data: {
      userId: bob.id,
      name: "Personal",
      currency: "USD",
      currentBalance: dec("800.0000"),
    },
  });

  const planStart = new Date("2026-02-01T12:00:00.000Z");
  const installmentPlan = await prisma.installmentPlan.create({
    data: {
      userId: alice.id,
      title: "Laptop installment",
      totalPrincipal: dec("1800.0000"),
      installmentCount: 6,
      startDate: planStart,
      currency: "USD",
      notes: "0% promo plan",
    },
  });

  const installmentAmount = dec("300.0000");
  for (let seq = 1; seq <= 6; seq++) {
    const dueDate = new Date(planStart);
    dueDate.setUTCMonth(dueDate.getUTCMonth() + (seq - 1));
    await prisma.installmentPayment.create({
      data: {
        installmentPlanId: installmentPlan.id,
        sequence: seq,
        dueDate,
        amount: installmentAmount,
        paidAt:
          seq <= 2
            ? new Date(dueDate.getTime() + 86_400_000)
            : null,
      },
    });
  }

  await prisma.transaction.createMany({
    data: [
      {
        userId: alice.id,
        bankAccountId: checking.id,
        type: "INCOME",
        amount: dec("4500.0000"),
        occurredAt: new Date("2026-05-01T10:00:00.000Z"),
        category: "Salary",
        description: "Paycheck",
      },
      {
        userId: alice.id,
        bankAccountId: checking.id,
        type: "EXPENSE",
        amount: dec("120.3500"),
        occurredAt: new Date("2026-05-03T15:30:00.000Z"),
        category: "Groceries",
        description: "Weekly shop",
      },
      {
        userId: alice.id,
        bankAccountId: checking.id,
        type: "EXPENSE",
        amount: dec("300.0000"),
        occurredAt: new Date("2026-03-02T12:00:00.000Z"),
        category: "Installments",
        description: "Laptop payment #1",
        installmentPlanId: installmentPlan.id,
      },
    ],
  });

  await prisma.debt.createMany({
    data: [
      {
        userId: alice.id,
        direction: "OWED_TO_YOU",
        counterparty: "Alex",
        principal: dec("250.0000"),
        openedAt: new Date("2026-01-10T00:00:00.000Z"),
        dueAt: new Date("2026-06-01T00:00:00.000Z"),
        interestApr: dec("0.0000"),
        notes: "Split dinner tab",
      },
      {
        userId: alice.id,
        direction: "YOU_OWE",
        counterparty: "Household CC",
        principal: dec("890.5000"),
        openedAt: new Date("2026-04-01T00:00:00.000Z"),
        dueAt: new Date("2026-07-01T00:00:00.000Z"),
        interestApr: dec("0.1899"),
        notes: "Revolving balance",
      },
    ],
  });

  const goal = await prisma.savingsGoal.create({
    data: {
      userId: alice.id,
      title: "Emergency fund",
      targetAmount: dec("10000.0000"),
      currency: "USD",
      deadline: new Date("2026-12-31T00:00:00.000Z"),
    },
  });

  await prisma.savingsEntry.createMany({
    data: [
      {
        userId: alice.id,
        savingsGoalId: goal.id,
        amount: dec("500.0000"),
        contributedAt: new Date("2026-05-01T08:00:00.000Z"),
        note: "Monthly transfer",
      },
      {
        userId: alice.id,
        savingsGoalId: goal.id,
        amount: dec("250.0000"),
        contributedAt: new Date("2026-05-10T08:00:00.000Z"),
      },
    ],
  });

  await prisma.investment.createMany({
    data: [
      {
        userId: alice.id,
        kind: "ETF",
        label: "Total US Market",
        currency: "USD",
        symbol: "VTI",
        shares: dec("12.50000000"),
        openedAt: new Date("2025-08-01T00:00:00.000Z"),
      },
      {
        userId: alice.id,
        kind: "REMUNERATED_ACCOUNT",
        label: "Money market",
        currency: "USD",
        annualRate: dec("0.045000"),
        principal: dec("5000.0000"),
        bankAccountId: savingsBank.id,
        openedAt: new Date("2026-01-15T00:00:00.000Z"),
      },
    ],
  });

  await prisma.etfPriceCache.create({
    data: {
      symbol: "VTI",
      fetchedAt: new Date("2026-05-14T18:00:00.000Z"),
      open: dec("285.123456"),
      high: dec("286.500000"),
      low: dec("284.900000"),
      close: dec("285.750000"),
      volume: dec("3200000.0000"),
      rawJson: { source: "demo-seed" },
    },
  });

  console.log(`Seed OK: users ${DEMO_EMAILS.join(", ")}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

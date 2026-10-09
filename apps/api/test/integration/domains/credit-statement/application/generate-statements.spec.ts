import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GenerateStatementsCommand } from "../../../../../src/domains/credit-statement/application/commands/generate-statements.command";
import { GenerateStatementsHandler } from "../../../../../src/domains/credit-statement/application/commands/generate-statements.handler";
import { SyncStatementCommand } from "../../../../../src/domains/credit-statement/application/commands/sync-statement.command";
import { SyncStatementHandler } from "../../../../../src/domains/credit-statement/application/commands/sync-statement.handler";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";

import {
  buildBankAccountRepo,
  buildCreditStatementRepo,
  buildInstallmentPlanRepo,
  buildTransactionSumsRepo,
  buildTransactionWriterRepo,
} from "../../../support/repositories";

/** A statement as the user types it: start of `start`'s day, end of `close`'s and
 * `due`'s (UTC here — the browser sends its own zone's). */
function gen(userId: string, accountId: string, start: string, close: string, due: string) {
  return new GenerateStatementsCommand(
    userId,
    accountId,
    new Date(`${start}T00:00:00.000Z`),
    new Date(`${close}T23:59:59.999Z`),
    new Date(`${due}T23:59:59.999Z`),
  );
}

/**
 * "Generar facturación" with user-declared dates: closes every currency together,
 * stamps the instalments due by the close exactly once (spec 014), and keeps each
 * movement in the period its date belongs to.
 * Requires a reachable Postgres (real test DB; not part of `test:unit`).
 *
 * Each `it` gets its OWN account: `findOrCreateOpenForAccount` chains a new
 * period's `periodStart` from the PREVIOUS one's `closedAt` once any statement
 * exists, so sharing an account across cases would make one test's timeline leak
 * into the next. Statement rows are created directly via Prisma (bypassing that
 * chaining) wherever a case needs an exact `periodStart` to land a boundary on a
 * specific date.
 *
 * `GenerateStatementsHandler.execute` is called directly rather than through Nest's
 * DI — same reasoning as the other integration specs in this tier: it is the real
 * adapters wired together by hand that are under test, not the HTTP layer.
 */
describe("GenerateStatementsHandler closes every currency together (integration, spec 028)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const handler = new GenerateStatementsHandler(
    { publish: () => undefined } as never,
    accountRepo,
    statementRepo,
    buildInstallmentPlanRepo(prisma),
    buildTransactionWriterRepo(prisma),
    prisma,
  );
  const userId = `u_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
  });

  afterAll(async () => {
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("a CLP and a USD open period close with the identical closedAt", async () => {
    const account = await accountRepo.createWithCards(userId, {
      name: "BCI Crédito",
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
      creditLimit: "900000",
      creditUsedInitial: "0",
      billingCycleDay: 20,
      billingCycleType: "CALENDAR_DAY",
      paymentMethod: "MANUAL",
      cards: [
        {
          name: "Visa",
          kind: "CREDIT",
          last4: "7758",
          expiryMonth: 6,
          expiryYear: 2031,
          isActive: true,
          isPrimary: true,
          isVirtual: false,
          isAdditional: false,
          cardholderName: null,
          network: "VISA",
          limits: [{ currency: "USD", limitAmount: "100", usedInitial: "0" }],
        },
      ],
    });
    // Both periods opened long ago, on the same anchor: their boundary has passed.
    const start = new Date("2025-01-01T00:00:00.000Z");
    await statementRepo.findOrCreateOpenForAccount(account.id, start, "CLP");
    await statementRepo.findOrCreateOpenForAccount(account.id, start, "USD");

    expect(
      await handler.execute(gen(userId, account.id, "2025-01-03", "2025-02-02", "2025-02-15")),
    ).toBe(true);

    const rows = await prisma.creditStatement.findMany({
      where: { accountId: account.id, closedAt: { not: null } },
    });
    expect(rows.map((r) => r.currency).sort()).toEqual(["CLP", "USD"]);
    for (const r of rows) {
      expect(r.periodStart).toEqual(new Date("2025-01-03T00:00:00.000Z"));
      expect(r.closedAt).toEqual(new Date("2025-02-02T23:59:59.999Z"));
      expect(r.dueDate).toEqual(new Date("2025-02-15T23:59:59.999Z"));
    }
    // The next period of each currency starts right after the close.
    const next = await prisma.creditStatement.findMany({
      where: { accountId: account.id, closedAt: null },
    });
    expect(next.map((r) => r.currency).sort()).toEqual(["CLP", "USD"]);
    expect(next.every((r) => r.periodStart.getTime() === Date.UTC(2025, 1, 3))).toBe(true);
  });
});

describe("GenerateStatementsHandler stamps instalments (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const planRepo = buildInstallmentPlanRepo(prisma);
  const handler = new GenerateStatementsHandler(
    { publish: () => undefined } as never,
    accountRepo,
    statementRepo,
    planRepo,
    buildTransactionWriterRepo(prisma),
    prisma,
  );
  const userId = `u_${randomUUID()}`;
  const accountIds: string[] = [];

  async function createAccount(): Promise<{ accountId: string; cardId: string }> {
    const account = await accountRepo.createWithCards(userId, {
      name: `CMR Visa ${randomUUID()}`,
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
    accountIds.push(account.id);
    return { accountId: account.id, cardId: account.cards[0].id };
  }

  async function createPlan(
    cardId: string,
    startDate: Date,
    installmentCount: number,
  ): Promise<string> {
    const plan = await prisma.installmentPlan.create({
      data: {
        userId,
        title: "Notebook ASUS",
        totalPrincipal: (installmentCount * 90000).toString(),
        installmentCount,
        startDate,
        currency: "CLP",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        cardId,
      },
    });
    await prisma.installmentPayment.createMany({
      data: Array.from({ length: installmentCount }, (_, i) => ({
        installmentPlanId: plan.id,
        sequence: i + 1,
        // UTC, matching how `nextBoundaryAfter` computes its boundary — a local-time
        // constructor would drift by this machine's offset and land instalments on
        // the wrong side of midnight.
        dueDate: new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + i, 5)),
        amount: "90000",
      })),
    });
    return plan.id;
  }

  /** Opens a period at an EXACT `periodStart`, bypassing
   * `findOrCreateOpenForAccount`'s "continue from the last close" chaining — needed
   * here to land a boundary on a specific date without walking every cycle between. */
  async function openPeriodAt(accountId: string, periodStart: Date): Promise<string> {
    const statement = await prisma.creditStatement.create({
      data: { accountId, periodStart },
      select: { id: true },
    });
    return statement.id;
  }

  async function billedSequences(planId: string): Promise<number[]> {
    const rows = await prisma.installmentPayment.findMany({
      where: { installmentPlanId: planId, creditStatementId: { not: null } },
      orderBy: { sequence: "asc" },
      select: { sequence: true },
    });
    return rows.map((r) => r.sequence);
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { id: userId, email: `${userId}@test.local`, passwordHash: "x", name: "Test" },
    });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.installmentPayment.deleteMany({ where: { plan: { userId } } });
    await prisma.installmentPlan.deleteMany({ where: { userId } });
    await prisma.creditStatement.deleteMany({ where: { accountId: { in: accountIds } } });
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("stamps the instalment due in the closing period, and only that one", async () => {
    const { accountId, cardId } = await createAccount();
    const planId = await createPlan(cardId, new Date("2026-01-05T00:00:00.000Z"), 12);
    await openPeriodAt(accountId, new Date("2026-01-01T00:00:00.000Z"));

    const closed = await handler.execute(
      gen(userId, accountId, "2026-01-01", "2026-01-10", "2026-01-25"),
    );
    expect(closed).toBe(true);
    expect(await billedSequences(planId)).toEqual([1]);
  });

  it("bills one instalment per generated statement, each exactly once", async () => {
    const { accountId, cardId } = await createAccount();
    const planId = await createPlan(cardId, new Date("2026-02-05T00:00:00.000Z"), 3);

    await handler.execute(gen(userId, accountId, "2026-02-01", "2026-02-20", "2026-03-05"));
    expect(await billedSequences(planId)).toEqual([1]);
    await handler.execute(gen(userId, accountId, "2026-02-21", "2026-03-20", "2026-04-05"));
    expect(await billedSequences(planId)).toEqual([1, 2]);
    await handler.execute(gen(userId, accountId, "2026-03-21", "2026-04-20", "2026-05-05"));
    expect(await billedSequences(planId)).toEqual([1, 2, 3]);
  });

  it("refuses a start before the last close; a close still ahead is fine", async () => {
    const { accountId } = await createAccount();
    await handler.execute(gen(userId, accountId, "2026-02-01", "2026-02-20", "2026-03-05"));
    await expect(
      handler.execute(gen(userId, accountId, "2026-02-15", "2026-03-20", "2026-04-05")),
    ).rejects.toMatchObject({ code: "STATEMENT_PERIOD_OVERLAPS" });
    await expect(
      handler.execute(gen(userId, accountId, "2026-02-21", "2999-01-01", "2999-01-10")),
    ).resolves.toBe(true);
  });

  it("bills what is dated inside the period and moves later movements to the next one", async () => {
    const { accountId, cardId } = await createAccount();
    const openId = await openPeriodAt(accountId, new Date("2026-03-01T00:00:00.000Z"));
    const movement = (day: string, amount: string) =>
      prisma.transaction.create({
        data: {
          userId,
          bankAccountId: accountId,
          cardId,
          type: "EXPENSE",
          amount,
          currency: "CLP",
          occurredAt: new Date(`${day}T00:00:00.000Z`),
          creditStatementId: openId,
        },
        select: { id: true },
      });
    const inside = await movement("2026-03-20", "1000");
    const after = await movement("2026-03-22", "2000");

    await handler.execute(gen(userId, accountId, "2026-03-01", "2026-03-20", "2026-04-05"));

    const rows = await prisma.transaction.findMany({
      where: { id: { in: [inside.id, after.id] } },
      select: { id: true, creditStatementId: true },
    });
    const next = await prisma.creditStatement.findFirst({ where: { accountId, closedAt: null } });
    expect(rows.find((r) => r.id === inside.id)?.creditStatementId).toBe(openId);
    expect(rows.find((r) => r.id === after.id)?.creditStatementId).toBe(next?.id);
  });

  // FR-013 — after the last instalment, the plan contributes nothing more. No
  // counter, no flag: it falls out of the selection rule on its own.
  it("bills nothing more once every instalment of a plan is already billed", async () => {
    const { accountId, cardId } = await createAccount();
    const planId = await createPlan(cardId, new Date("2026-05-05T00:00:00.000Z"), 1);
    await openPeriodAt(accountId, new Date("2026-05-01T00:00:00.000Z"));

    await handler.execute(gen(userId, accountId, "2026-05-01", "2026-05-10", "2026-05-25"));
    expect(await billedSequences(planId)).toEqual([1]);

    await handler.execute(gen(userId, accountId, "2026-05-11", "2026-06-10", "2026-06-25"));
    expect(await billedSequences(planId)).toEqual([1]); // unchanged: nothing left to bill
  });

  // FR-012 — reconciling a period against real movements must not un-stamp its
  // instalments. `sync` recomputes from a DATE WINDOW, which is exactly the path
  // that must keep respecting the stamped link rather than resetting it.
  it("sync preserves a period's stamped instalments", async () => {
    const { accountId, cardId } = await createAccount();
    const planId = await createPlan(cardId, new Date("2026-07-05T00:00:00.000Z"), 1);
    const statementId = await openPeriodAt(accountId, new Date("2026-07-01T00:00:00.000Z"));

    await handler.execute(gen(userId, accountId, "2026-07-01", "2026-07-10", "2026-07-25"));
    expect(await billedSequences(planId)).toEqual([1]);
    const billedBefore = await prisma.installmentPayment.findFirst({
      where: { installmentPlanId: planId },
    });
    expect(billedBefore?.creditStatementId).toBe(statementId);

    const syncHandler = new SyncStatementHandler(
      { publish: () => undefined } as never,
      statementRepo,
      accountRepo,
      buildTransactionSumsRepo(prisma),
      buildTransactionWriterRepo(prisma),
      prisma,
    );
    await syncHandler.execute(new SyncStatementCommand(userId, accountId, statementId));

    const billedAfter = await prisma.installmentPayment.findFirst({
      where: { installmentPlanId: planId },
    });
    expect(billedAfter?.creditStatementId).toBe(statementId);
  });

  it("a statement closing ahead keeps receiving the movements dated inside it", async () => {
    const { accountId } = await createAccount();
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const close = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const due = new Date(close.getTime() + 10 * 24 * 60 * 60 * 1000);
    await handler.execute(gen(userId, accountId, "2026-02-01", ymd(close), ymd(due)));
    const generated = await prisma.creditStatement.findFirstOrThrow({
      where: { accountId, closedAt: { not: null } },
    });

    const today = await statementRepo.findOrCreateOpenForAccount(
      accountId,
      new Date(),
      "CLP",
      new Date(),
    );
    expect(today.id).toBe(generated.id);
    // Dated after that close: the period that follows it.
    const later = await statementRepo.findOrCreateOpenForAccount(
      accountId,
      new Date(),
      "CLP",
      new Date(close.getTime() + 2 * 24 * 60 * 60 * 1000),
    );
    expect(later.id).not.toBe(generated.id);
  });
});

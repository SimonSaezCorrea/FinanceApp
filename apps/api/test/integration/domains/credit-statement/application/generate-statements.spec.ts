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

/**
 * Spec 014 — closing a period stamps the instalments it charges, and does so
 * EXACTLY ONCE across gaps in period generation (FR-008, FR-009, FR-012, FR-013).
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

    const closed = await handler.execute(new GenerateStatementsCommand(userId, accountId));
    expect(closed).toBe(true);
    expect(await billedSequences(planId)).toEqual([1]);
  });

  // FR-009 — the gap case that justifies the whole column: a whole cycle passes with
  // no card activity, so no period is EVER generated for it. Once activity resumes,
  // the instalment that fell due during the gap must still be charged exactly once —
  // never lost, never doubled up with the one after it.
  //
  // Walked as TWO closes, because that is what actually happens in production: each
  // close only reaches the immediate next boundary after its period's start, and the
  // account's next OPEN period always continues from where the last one closed
  // (`findOrCreateOpenForAccount`). A gap of silence doesn't change that mechanics —
  // it just means the period that eventually reopens still starts where the last
  // close left off, so nothing in between is skipped.
  it("charges everything still unbilled across a gap with no generated period, exactly once", async () => {
    const { accountId, cardId } = await createAccount();
    const planId = await createPlan(cardId, new Date("2026-02-05T00:00:00.000Z"), 3);

    // Cycle 1: closes at Feb 5, billing instalment 1. No card activity in the cycles
    // that follow — nothing forces a new period for a while (the gap).
    await openPeriodAt(accountId, new Date("2026-02-01T00:00:00.000Z"));
    await handler.execute(new GenerateStatementsCommand(userId, accountId));
    expect(await billedSequences(planId)).toEqual([1]);

    // Activity resumes. No card activity meant no OPEN period existed in the
    // meantime; the account had none to reuse (its last one closed at Feb 5), so
    // the new one continues exactly there — the real chaining mechanism, not a
    // date this test hands it. Closing it reaches its own next boundary (Mar 5)
    // and must bill instalment 2 — not instalment 1 again.
    const reopened = await statementRepo.findOrCreateOpenForAccount(
      accountId,
      new Date("2026-02-05T00:00:00.000Z"), // fallback, unused: a prior close exists
    );
    const reopenedRow = await prisma.creditStatement.findUnique({ where: { id: reopened.id } });
    expect(reopenedRow?.periodStart).toEqual(new Date("2026-02-05T00:00:00.000Z"));

    await handler.execute(new GenerateStatementsCommand(userId, accountId));
    expect(await billedSequences(planId)).toEqual([1, 2]);

    // And once more: the third and last instalment.
    const reopenedAgain = await statementRepo.findOrCreateOpenForAccount(accountId, new Date());
    expect(reopenedAgain.id).not.toBe(reopened.id);
    await handler.execute(new GenerateStatementsCommand(userId, accountId));
    expect(await billedSequences(planId)).toEqual([1, 2, 3]);
  });

  // FR-013 — after the last instalment, the plan contributes nothing more. No
  // counter, no flag: it falls out of the selection rule on its own.
  it("bills nothing more once every instalment of a plan is already billed", async () => {
    const { accountId, cardId } = await createAccount();
    const planId = await createPlan(cardId, new Date("2026-05-05T00:00:00.000Z"), 1);
    await openPeriodAt(accountId, new Date("2026-05-01T00:00:00.000Z"));

    await handler.execute(new GenerateStatementsCommand(userId, accountId));
    expect(await billedSequences(planId)).toEqual([1]);

    await statementRepo.findOrCreateOpenForAccount(accountId, new Date("2026-05-05T00:00:00.000Z"));
    await handler.execute(new GenerateStatementsCommand(userId, accountId));
    expect(await billedSequences(planId)).toEqual([1]); // unchanged: nothing left to bill
  });

  // FR-012 — reconciling a period against real movements must not un-stamp its
  // instalments. `sync` recomputes from a DATE WINDOW, which is exactly the path
  // that must keep respecting the stamped link rather than resetting it.
  it("sync preserves a period's stamped instalments", async () => {
    const { accountId, cardId } = await createAccount();
    const planId = await createPlan(cardId, new Date("2026-07-05T00:00:00.000Z"), 1);
    const statementId = await openPeriodAt(accountId, new Date("2026-07-01T00:00:00.000Z"));

    await handler.execute(new GenerateStatementsCommand(userId, accountId));
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
});

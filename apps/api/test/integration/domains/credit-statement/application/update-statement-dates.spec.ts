import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GenerateStatementsCommand } from "../../../../../src/domains/credit-statement/application/commands/generate-statements.command";
import { GenerateStatementsHandler } from "../../../../../src/domains/credit-statement/application/commands/generate-statements.handler";
import { UpdateStatementDatesCommand } from "../../../../../src/domains/credit-statement/application/commands/update-statement-dates.command";
import { UpdateStatementDatesHandler } from "../../../../../src/domains/credit-statement/application/commands/update-statement-dates.handler";
import { PrismaService } from "../../../../../src/infra/prisma/prisma.service";
import {
  buildBankAccountRepo,
  buildCreditStatementRepo,
  buildInstallmentPlanRepo,
  buildTransactionWriterRepo,
} from "../../../support/repositories";

const start = (d: string) => new Date(`${d}T00:00:00.000Z`);
const end = (d: string) => new Date(`${d}T23:59:59.999Z`);

/** "Editar fechas" of a generated statement against a real Postgres. */
describe("UpdateStatementDatesHandler (integration)", () => {
  const prisma = new PrismaService(new ConfigService());
  const accountRepo = buildBankAccountRepo(prisma);
  const statementRepo = buildCreditStatementRepo(prisma);
  const planRepo = buildInstallmentPlanRepo(prisma);
  const writer = buildTransactionWriterRepo(prisma);
  const publish = { publish: () => undefined } as never;
  const generate = new GenerateStatementsHandler(
    publish,
    accountRepo,
    statementRepo,
    planRepo,
    writer,
    prisma,
  );
  const update = new UpdateStatementDatesHandler(
    publish,
    accountRepo,
    statementRepo,
    planRepo,
    writer,
    prisma,
  );
  const userId = `u_${randomUUID()}`;

  async function createAccount(): Promise<{ accountId: string; cardId: string }> {
    const account = await accountRepo.createWithCards(userId, {
      name: `Visa ${randomUUID()}`,
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
      billingCycleType: "CALENDAR_DAY",
      paymentMethod: "MANUAL",
      cards: [
        {
          name: "Visa",
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
    return { accountId: account.id, cardId: account.cards[0].id };
  }

  async function movement(accountId: string, cardId: string, day: string) {
    const open = await statementRepo.findOrCreateOpenForAccount(accountId, start(day), "CLP");
    return prisma.transaction.create({
      data: {
        userId,
        bankAccountId: accountId,
        cardId,
        type: "EXPENSE",
        amount: "1000",
        currency: "CLP",
        occurredAt: start(day),
        creditStatementId: open.id,
      },
      select: { id: true },
    });
  }

  const linkOf = async (id: string) =>
    (await prisma.transaction.findUnique({ where: { id }, select: { creditStatementId: true } }))
      ?.creditStatementId;

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
    await prisma.bankAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("moving the close earlier moves later movements and instalments to the next period", async () => {
    const { accountId, cardId } = await createAccount();
    const early = await movement(accountId, cardId, "2026-03-10");
    const late = await movement(accountId, cardId, "2026-03-18");
    const plan = await prisma.installmentPlan.create({
      data: {
        userId,
        title: "TV",
        totalPrincipal: "100000",
        installmentCount: 1,
        startDate: start("2026-03-15"),
        currency: "CLP",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        cardId,
      },
    });
    await prisma.installmentPayment.create({
      data: {
        installmentPlanId: plan.id,
        sequence: 1,
        dueDate: start("2026-03-15"),
        amount: "100000",
      },
    });
    await generate.execute(
      new GenerateStatementsCommand(
        userId,
        accountId,
        start("2026-03-01"),
        end("2026-03-20"),
        end("2026-04-05"),
      ),
    );
    const closed = await prisma.creditStatement.findFirstOrThrow({
      where: { accountId, closedAt: { not: null } },
    });
    expect(await linkOf(late.id)).toBe(closed.id);

    await update.execute(
      new UpdateStatementDatesCommand(
        userId,
        accountId,
        closed.id,
        start("2026-03-01"),
        end("2026-03-12"),
        end("2026-03-30"),
      ),
    );

    const after = await prisma.creditStatement.findUniqueOrThrow({ where: { id: closed.id } });
    expect(after.closedAt).toEqual(end("2026-03-12"));
    expect(after.dueDate).toEqual(end("2026-03-30"));
    const open = await prisma.creditStatement.findFirstOrThrow({
      where: { accountId, closedAt: null },
    });
    expect(open.periodStart).toEqual(new Date(end("2026-03-12").getTime() + 1));
    expect(await linkOf(early.id)).toBe(closed.id);
    expect(await linkOf(late.id)).toBe(open.id);
    const instalment = await prisma.installmentPayment.findFirstOrThrow({
      where: { installmentPlanId: plan.id },
    });
    expect(instalment.creditStatementId).toBeNull();
  });

  it("only the due date may change on a settled period, and the close only on the latest", async () => {
    const { accountId } = await createAccount();
    await generate.execute(
      new GenerateStatementsCommand(
        userId,
        accountId,
        start("2026-01-01"),
        end("2026-01-20"),
        end("2026-02-05"),
      ),
    );
    await generate.execute(
      new GenerateStatementsCommand(
        userId,
        accountId,
        start("2026-01-21"),
        end("2026-02-20"),
        end("2026-03-05"),
      ),
    );
    const [first] = await prisma.creditStatement.findMany({
      where: { accountId, closedAt: { not: null } },
      orderBy: { closedAt: "asc" },
    });

    await expect(
      update.execute(
        new UpdateStatementDatesCommand(
          userId,
          accountId,
          first!.id,
          start("2026-01-01"),
          end("2026-01-18"),
          end("2026-02-05"),
        ),
      ),
    ).rejects.toMatchObject({ code: "STATEMENT_DATES_LOCKED" });

    await prisma.creditStatement.update({ where: { id: first!.id }, data: { paidAt: new Date() } });
    await expect(
      update.execute(
        new UpdateStatementDatesCommand(
          userId,
          accountId,
          first!.id,
          start("2026-01-02"),
          end("2026-01-20"),
          end("2026-02-05"),
        ),
      ),
    ).rejects.toMatchObject({ code: "STATEMENT_DATES_LOCKED" });

    await update.execute(
      new UpdateStatementDatesCommand(
        userId,
        accountId,
        first!.id,
        start("2026-01-01"),
        end("2026-01-20"),
        end("2026-02-10"),
      ),
    );
    const row = await prisma.creditStatement.findUniqueOrThrow({ where: { id: first!.id } });
    expect(row.dueDate).toEqual(end("2026-02-10"));
  });

  it("editing the OPEN period only schedules its dates: nothing closes, nothing new opens", async () => {
    const { accountId, cardId } = await createAccount();
    await movement(accountId, cardId, "2026-03-10");
    const open = await prisma.creditStatement.findFirstOrThrow({
      where: { accountId, closedAt: null },
    });

    await update.execute(
      new UpdateStatementDatesCommand(
        userId,
        accountId,
        open.id,
        start("2026-03-01"),
        end("2099-04-20"),
        end("2099-05-05"),
      ),
    );

    const rows = await prisma.creditStatement.findMany({ where: { accountId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: open.id, closedAt: null });
    expect(rows[0]!.plannedCloseAt).toEqual(end("2099-04-20"));
    expect(rows[0]!.dueDate).toEqual(end("2099-05-05"));
    expect(rows[0]!.periodStart).toEqual(start("2026-03-01"));
  });

  it("the sweep generates a scheduled statement once its close has arrived, and not before", async () => {
    const { accountId, cardId } = await createAccount();
    const mine = await movement(accountId, cardId, "2026-03-10");
    const open = await prisma.creditStatement.findFirstOrThrow({
      where: { accountId, closedAt: null },
    });
    await update.execute(
      new UpdateStatementDatesCommand(
        userId,
        accountId,
        open.id,
        start("2026-03-01"),
        end("2026-03-20"),
        end("2026-04-05"),
      ),
    );

    // Before its close: not due.
    const early = (await statementRepo.listDueScheduled(start("2026-03-19"))).filter(
      (d) => d.accountId === accountId,
    );
    expect(early).toEqual([]);

    // The day after: due, with the dates as scheduled.
    const due = (await statementRepo.listDueScheduled(start("2026-03-21"))).filter(
      (d) => d.accountId === accountId,
    );
    expect(due).toEqual([
      {
        userId,
        accountId,
        periodStart: start("2026-03-01"),
        closedAt: end("2026-03-20"),
        dueDate: end("2026-04-05"),
      },
    ]);

    await generate.execute(
      new GenerateStatementsCommand(
        userId,
        accountId,
        due[0]!.periodStart,
        due[0]!.closedAt,
        due[0]!.dueDate,
      ),
    );
    const closed = await prisma.creditStatement.findFirstOrThrow({
      where: { accountId, closedAt: { not: null } },
    });
    expect(closed.plannedCloseAt).toBeNull();
    expect(await linkOf(mine.id)).toBe(closed.id);
    // Generated: no longer due.
    const after = (await statementRepo.listDueScheduled(start("2026-03-21"))).filter(
      (d) => d.accountId === accountId,
    );
    expect(after).toEqual([]);
  });
});

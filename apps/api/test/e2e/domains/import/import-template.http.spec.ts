import { randomUUID } from "node:crypto";

import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { useJsonBodyLimit } from "../../../../src/infra/http/body-limit";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { randomValidRut } from "../../support/rut";

const date = (d: string) => `${d}T00:00:00.000Z`;

/**
 * specs/027 — the Cuadra template through the real HTTP surface: preview writes
 * nothing, commit applies every sheet all-or-nothing and idempotently, each
 * account's balance mode is honoured, debts/plans/goals end up with their real
 * progress, and a credit-card instalment paid in the template is never billed.
 * Requires a reachable, SEEDED Postgres (system categories).
 */
describe("Import template HTTP (e2e)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const email = `e2e_template_${randomUUID()}@test.local`;
  const otherEmail = `e2e_template_other_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let bci: string;
  let mach: string;
  let prepaid: string;
  let tc: string;
  let tcCard: string;
  let foreign: string;

  async function register(address: string): Promise<string[]> {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: address,
      password,
      name: "E2E Template",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: randomValidRut(),
    });
    return res.get("Set-Cookie") ?? [];
  }

  async function createAccount(cookie: string[], body: Record<string, unknown>) {
    const res = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookie)
      .send(body);
    expect(res.status).toBe(201);
    return res.body;
  }

  const preview = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post("/api/v1/import/template/preview")
      .set("Cookie", cookies)
      .send(body);
  const commit = (body: Record<string, unknown>, key: string = randomUUID()) =>
    request(app.getHttpServer())
      .post("/api/v1/import/template")
      .set("Cookie", cookies)
      .set("Idempotency-Key", key)
      .send(body);

  const account = (id: string) => prisma.bankAccount.findUniqueOrThrow({ where: { id } });
  const txCount = () => prisma.transaction.count({ where: { user: { email } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    useJsonBodyLimit(app);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    cookies = await register(email);
    bci = (
      await createAccount(cookies, {
        name: "BCI",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "123",
        initialBalance: "1000000",
      })
    ).id;
    mach = (
      await createAccount(cookies, {
        name: "MACH",
        type: "SIGHT",
        currency: "CLP",
        accountNumber: "456",
        initialBalance: "0",
      })
    ).id;
    prepaid = (
      await createAccount(cookies, {
        name: "Prepago",
        type: "PREPAID",
        currency: "CLP",
        accountNumber: "789",
        initialBalance: "10000",
      })
    ).id;
    const credit = await createAccount(cookies, {
      name: "BCI Visa",
      type: "CREDIT_CARD",
      currency: "CLP",
      cards: [
        {
          name: "Visa",
          kind: "CREDIT",
          last4: "4827",
          expiryMonth: 12,
          expiryYear: 2030,
          limits: [{ currency: "CLP", limitAmount: "2000000" }],
        },
      ],
    });
    tc = credit.id;
    tcCard = credit.cards[0].id;
    await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${tc}`)
      .set("Cookie", cookies)
      .send({ billingCycleDay: 5, billingCycleType: "CALENDAR_DAY" });

    foreign = (
      await createAccount(await register(otherEmail), {
        name: "Other's",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "999",
      })
    ).id;
  });

  afterAll(async () => {
    const users = { email: { in: [email, otherEmail] } };
    await prisma.transaction.deleteMany({ where: { user: users } });
    await prisma.savingsEntry.deleteMany({ where: { user: users } });
    await prisma.savingsGoal.deleteMany({ where: { user: users } });
    await prisma.recurringExpense.deleteMany({ where: { user: users } });
    await prisma.debt.deleteMany({ where: { user: users } });
    await prisma.installmentPayment.deleteMany({ where: { plan: { user: users } } });
    await prisma.installmentPlan.deleteMany({ where: { user: users } });
    await prisma.creditStatement.deleteMany({ where: { account: { user: users } } });
    await prisma.bankAccount.deleteMany({ where: { user: users } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  /** Two movements on BCI and a BCI → MACH transfer, both accounts in ADD mode. */
  const withIds = () => ({
    balanceModes: [
      { accountId: bci, mode: "ADD" },
      { accountId: mach, mode: "ADD" },
    ],
    movements: [
      {
        row: 2,
        occurredAt: date("2026-01-10"),
        type: "INCOME",
        amount: "50000",
        bankAccountId: bci,
      },
      {
        row: 3,
        occurredAt: date("2026-01-11"),
        type: "EXPENSE",
        amount: "20000",
        bankAccountId: bci,
      },
    ],
    transfers: [
      {
        row: 2,
        occurredAt: date("2026-01-12"),
        fromAccountId: bci,
        toAccountId: mach,
        outgoingAmount: "40000",
        incomingAmount: "40000",
      },
    ],
  });

  it("preview reports counts and effects and writes nothing (US6, R9)", async () => {
    const before = await txCount();
    const res = await preview(withIds());
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.counts.movements).toBe(2);
    expect(res.body.counts.transfers).toBe(1);
    const bciEffect = res.body.accounts.find((a: { accountId: string }) => a.accountId === bci);
    expect(Number(bciEffect.netCash)).toBe(-10000);
    expect(Number(bciEffect.balanceAfter)).toBe(990000);
    expect(await txCount()).toBe(before);
  });

  it("commit applies movements and a transfer, and a retry doesn't duplicate (US2)", async () => {
    const key = randomUUID();
    const first = await commit(withIds(), key);
    expect(first.status).toBe(201);
    const afterFirst = await txCount();
    const again = await commit(withIds(), key);
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(await txCount()).toBe(afterFirst);

    expect(Number((await account(bci)).currentBalance)).toBe(990000);
    expect(Number((await account(mach)).currentBalance)).toBe(40000);
    const legs = await prisma.transaction.findMany({
      where: { user: { email }, transferGroupId: { not: null } },
    });
    expect(legs).toHaveLength(2);
    expect(new Set(legs.map((l) => l.transferGroupId)).size).toBe(1);
  });

  it("INCLUDED (the default) keeps today's balance and moves the opening one (FR-022a)", async () => {
    const before = await account(mach);
    const res = await commit({
      movements: [
        {
          row: 2,
          occurredAt: date("2025-12-01"),
          type: "INCOME",
          amount: "7000",
          bankAccountId: mach,
        },
      ],
    });
    expect(res.status).toBe(201);
    const after = await account(mach);
    expect(after.currentBalance.toString()).toBe(before.currentBalance.toString());
    expect(Number(after.initialBalance)).toBe(Number(before.initialBalance) - 7000);
  });

  it("a foreign account is not found, located on its sheet and row (Principle II)", async () => {
    const res = await commit({
      movements: [
        {
          row: 2,
          occurredAt: date("2026-01-10"),
          type: "EXPENSE",
          amount: "1",
          bankAccountId: foreign,
        },
      ],
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: "ACCOUNT_NOT_FOUND", field: "movements.2" });
  });

  it("Victor: a debt with three payments ends 3/4 with three linked incomes (US3)", async () => {
    const res = await commit({
      debts: [
        {
          row: 2,
          ref: "VICTOR",
          direction: "OWED_TO_YOU",
          counterparty: "Victor",
          principal: "200000",
          currency: "CLP",
          openedAt: date("2026-02-14"),
          totalInstallments: 4,
          frequency: "MONTHLY",
          frequencyInterval: 1,
        },
      ],
      debtPayments: ["2026-03-14", "2026-04-14", "2026-05-14"].map((d, i) => ({
        row: i + 2,
        debtRef: "VICTOR",
        paidAt: date(d),
        accountId: bci,
      })),
    });
    expect(res.status).toBe(201);
    const debts = await request(app.getHttpServer()).get("/api/v1/debts").set("Cookie", cookies);
    const debt = debts.body.find((d: { counterparty: string }) => d.counterparty === "Victor");
    expect(debt.paidInstallments).toBe(3);
    expect(debt.settledAt).toBeNull();
    expect(JSON.stringify(debts.body)).not.toContain("VICTOR"); // FR-014
    const linked = await prisma.transaction.findMany({ where: { debtId: debt.id } });
    expect(linked).toHaveLength(3);
    expect(linked.every((t) => t.type === "INCOME")).toBe(true);
  });

  it("the notebook: paid instalments are never billed; debit plans pay with real money (US4)", async () => {
    const res = await commit({
      balanceModes: [{ accountId: tc, mode: "ADD" }],
      plans: [
        {
          row: 2,
          ref: "NOTEBOOK",
          title: "Notebook",
          startDate: date("2026-04-10"),
          totalPrincipal: "600000",
          installmentCount: 6,
          currency: "CLP",
          frequency: "MONTHLY",
          frequencyInterval: 1,
          cardId: tcCard,
        },
        {
          row: 3,
          ref: "LOAN",
          title: "Préstamo",
          startDate: date("2026-01-10"),
          totalPrincipal: "300000",
          installmentCount: 3,
          currency: "CLP",
          frequency: "MONTHLY",
          frequencyInterval: 1,
        },
      ],
      planPayments: [
        ...[1, 2, 3, 4].map((s) => ({
          row: s + 1,
          planRef: "NOTEBOOK",
          sequence: s,
          paidAt: date(`2026-0${s + 3}-15`),
        })),
        ...[1, 2, 3].map((s) => ({
          row: s + 5,
          planRef: "LOAN",
          sequence: s,
          paidAt: date(`2026-0${s}-15`),
          accountId: bci,
          amount: "100000",
        })),
      ],
    });
    expect(res.status).toBe(201);

    // 600.000 bought, 4 × 100.000 settled outside the app.
    expect(Number((await account(tc)).creditUsed)).toBe(200000);

    const plans = await prisma.installmentPlan.findMany({
      where: { user: { email } },
      include: { payments: true },
    });
    const notebook = plans.find((p) => p.title === "Notebook")!;
    const loan = plans.find((p) => p.title === "Préstamo")!;
    expect(loan.payments.every((p) => p.paidAt !== null)).toBe(true);
    expect(await prisma.transaction.count({ where: { installmentPlanId: loan.id } })).toBe(3);

    await request(app.getHttpServer())
      .post(`/api/v1/accounts/${tc}/generate-statements`)
      .set("Cookie", cookies);
    const billed = await prisma.installmentPayment.findMany({
      where: { installmentPlanId: notebook.id, creditStatementId: { not: null } },
    });
    expect(billed.every((p) => p.sequence > 4)).toBe(true);
  });

  it("recurring series and a goal with its contributions (US5)", async () => {
    const res = await commit({
      balanceModes: [{ accountId: bci, mode: "ADD" }],
      recurring: [
        {
          row: 2,
          label: "Spotify",
          amount: "6990",
          currency: "CLP",
          frequency: "MONTHLY",
          interval: 1,
          anchorDate: date("2026-01-05"),
          bankAccountId: bci,
        },
      ],
      goals: [{ row: 2, ref: "VIAJE", title: "Viaje", targetAmount: "1000000", currency: "CLP" }],
      contributions: [
        {
          row: 2,
          goalRef: "VIAJE",
          contributedAt: date("2026-02-01"),
          amount: "50000",
          bankAccountId: bci,
        },
        {
          row: 3,
          goalRef: "VIAJE",
          contributedAt: date("2026-03-01"),
          amount: "50000",
          bankAccountId: bci,
        },
      ],
    });
    expect(res.status).toBe(201);
    const goals = await request(app.getHttpServer())
      .get("/api/v1/savings/goals")
      .set("Cookie", cookies);
    const viaje = goals.body.find((g: { title: string }) => g.title === "Viaje");
    expect(Number(viaje.savedAmount)).toBe(100000);
    const recurring = await request(app.getHttpServer())
      .get("/api/v1/recurring")
      .set("Cookie", cookies);
    expect(recurring.body.find((r: { label: string }) => r.label === "Spotify").active).toBe(true);
  });

  it("a series that ended, with its four payments linked (recurring end date)", async () => {
    const res = await commit({
      balanceModes: [{ accountId: bci, mode: "ADD" }],
      recurring: [
        {
          row: 2,
          ref: "SPOTIFY",
          label: "Spotify Premium",
          amount: "6990",
          currency: "CLP",
          frequency: "MONTHLY",
          interval: 1,
          anchorDate: date("2026-01-01"),
          endDate: date("2026-04-01"),
          bankAccountId: bci,
        },
      ],
      movements: ["01", "02", "03", "04"].map((m, i) => ({
        row: i + 2,
        occurredAt: date(`2026-${m}-01`),
        type: "EXPENSE",
        amount: "6990",
        bankAccountId: bci,
        recurringRef: "SPOTIFY",
      })),
    });
    expect(res.status).toBe(201);
    const list = await request(app.getHttpServer()).get("/api/v1/recurring").set("Cookie", cookies);
    const series = list.body.find((r: { label: string }) => r.label === "Spotify Premium");
    expect(series.status).toBe("FINISHED");
    expect(series.nextDueAt).toBeNull();
    expect(series.endDate).toBe("2026-04-01T00:00:00.000Z");
    const history = await request(app.getHttpServer())
      .get(`/api/v1/transactions?recurringExpenseId=${series.id}`)
      .set("Cookie", cookies);
    expect(history.body.items).toHaveLength(4);
  });

  it("all or nothing: a rule broken on the last sheet leaves no row and no balance behind (FR-025)", async () => {
    const before = {
      tx: await txCount(),
      debts: await prisma.debt.count({ where: { user: { email } } }),
      goals: await prisma.savingsGoal.count({ where: { user: { email } } }),
      statements: await prisma.creditStatement.count({ where: { accountId: tc } }),
      bci: (await account(bci)).currentBalance.toString(),
    };
    const res = await commit({
      balanceModes: [{ accountId: prepaid, mode: "ADD" }],
      movements: [
        {
          row: 2,
          occurredAt: date("2026-06-01"),
          type: "EXPENSE",
          amount: "5000",
          bankAccountId: bci,
        },
        {
          row: 3,
          occurredAt: date("2026-06-02"),
          type: "EXPENSE",
          amount: "1000",
          bankAccountId: tc,
        },
      ],
      debts: [
        {
          row: 2,
          ref: "X",
          direction: "YOU_OWE",
          counterparty: "Nadie",
          principal: "1000",
          currency: "CLP",
          openedAt: date("2026-01-01"),
          totalInstallments: 1,
          frequency: "MONTHLY",
          frequencyInterval: 1,
        },
      ],
      goals: [{ row: 2, ref: "G", title: "Rollback", targetAmount: "1", currency: "CLP" }],
      contributions: [
        {
          row: 2,
          goalRef: "G",
          contributedAt: date("2026-06-03"),
          amount: "999999",
          bankAccountId: prepaid,
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: "PREPAID_INSUFFICIENT_BALANCE",
      field: "contributions.2",
    });
    expect(await txCount()).toBe(before.tx);
    expect(await prisma.debt.count({ where: { user: { email } } })).toBe(before.debts);
    expect(await prisma.savingsGoal.count({ where: { user: { email } } })).toBe(before.goals);
    expect(await prisma.creditStatement.count({ where: { accountId: tc } })).toBe(
      before.statements,
    );
    expect((await account(bci)).currentBalance.toString()).toBe(before.bci);
  });

  it("preview lists every problem, from several sheets", async () => {
    const res = await preview({
      movements: [
        {
          row: 12,
          occurredAt: date("2026-01-10"),
          type: "EXPENSE",
          amount: "1",
          bankAccountId: foreign,
        },
      ],
      debtPayments: [{ row: 3, debtRef: "NOBODY", paidAt: date("2026-01-10"), accountId: bci }],
    });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toEqual([
      { code: "ACCOUNT_NOT_FOUND", sheet: "movements", row: 12 },
      { code: "IMPORT_UNKNOWN_REF", sheet: "debtPayments", row: 3, field: "debtRef" },
    ]);
  });

  it("2.000 rows are previewed and imported in under 10 seconds each (SC-005)", async () => {
    const movements = Array.from({ length: 2000 }, (_, i) => ({
      row: i + 2,
      occurredAt: date(
        `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      ),
      type: i % 2 === 0 ? "INCOME" : "EXPENSE",
      amount: "100",
      bankAccountId: mach,
    }));
    let started = Date.now();
    const checked = await preview({ movements });
    expect(checked.status).toBe(200);
    expect(checked.body.valid).toBe(true);
    expect(Date.now() - started).toBeLessThan(10_000);

    started = Date.now();
    const done = await commit({ movements });
    expect(done.status).toBe(201);
    expect(done.body.counts.movements).toBe(2000);
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 30_000);

  it("requires an Idempotency-Key to commit", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/import/template")
      .set("Cookie", cookies)
      .send(withIds());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });
});

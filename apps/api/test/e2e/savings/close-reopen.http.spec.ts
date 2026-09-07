import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../src/app.module";
import { AllExceptionsFilter } from "../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../src/infra/prisma/prisma.service";

/**
 * Cerrar/reabrir una meta (US4, quickstart escenarios 3-4): "retirar a
 * cuenta" mueve dinero real y reversible; "ahorro libre"/"traspaso" solo
 * reasignan `savingsGoalId`, sin tocar ningún saldo.
 */
describe("Savings goal close/reopen (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_close_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let accountId: string;

  async function createGoal(target: string) {
    const res = await request(app.getHttpServer())
      .post("/api/v1/savings/goals")
      .set("Cookie", cookies)
      .send({ title: "Notebook", targetAmount: target, currency: "CLP" });
    return res.body.id as string;
  }

  async function contribute(goalId: string, amount: string) {
    return request(app.getHttpServer())
      .post("/api/v1/savings/entries")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        savingsGoalId: goalId,
        amount,
        currency: "CLP",
        contributedAt: "2026-09-01T12:00:00.000Z",
        bankAccountId: accountId,
      });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const registerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "E2E Close User" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const accountRes = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Cuenta Corriente",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "1234",
        initialBalance: "1000000",
      });
    accountId = accountRes.body.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.savingsEntry.deleteMany({ where: { user: { email } } });
    await prisma.savingsGoal.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.idempotencyRecord.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("refuses to close a goal that is neither cumplida nor vencida", async () => {
    const goalId = await createGoal("500000");
    await contribute(goalId, "100000");

    const res = await request(app.getHttpServer())
      .post(`/api/v1/savings/goals/${goalId}/close`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ destination: "FREE_SAVINGS" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SAVINGS_GOAL_NOT_CLOSEABLE");
  });

  it("closes a cumplida goal with WITHDRAW_TO_ACCOUNT, moves real money, and reopen reverses it exactly", async () => {
    const goalId = await createGoal("200000");
    await contribute(goalId, "200000");

    const before = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    const balanceBeforeClose = before.body.currentBalance;

    const closed = await request(app.getHttpServer())
      .post(`/api/v1/savings/goals/${goalId}/close`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ destination: "WITHDRAW_TO_ACCOUNT", accountId });
    expect(closed.status).toBe(200);
    expect(closed.body.closedAt).not.toBeNull();
    expect(closed.body.closeDestination).toBe("WITHDRAW_TO_ACCOUNT");

    const afterClose = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(afterClose.body.currentBalance).toBe((Number(balanceBeforeClose) + 200000).toFixed(4));

    // A closed goal keeps its history — its aportes are still readable.
    const entriesRes = await request(app.getHttpServer())
      .get("/api/v1/savings/entries")
      .set("Cookie", cookies);
    expect(entriesRes.body.some((e: { savingsGoalId: string }) => e.savingsGoalId === goalId)).toBe(
      true,
    );

    // Closing again is refused.
    const secondClose = await request(app.getHttpServer())
      .post(`/api/v1/savings/goals/${goalId}/close`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ destination: "FREE_SAVINGS" });
    expect(secondClose.status).toBe(409);
    expect(secondClose.body.error.code).toBe("SAVINGS_GOAL_ALREADY_CLOSED");

    // A closed goal's entries are frozen.
    const entryId = entriesRes.body.find(
      (e: { savingsGoalId: string }) => e.savingsGoalId === goalId,
    ).id;
    const patchFrozen = await request(app.getHttpServer())
      .patch(`/api/v1/savings/entries/${entryId}`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ amount: "1" });
    expect(patchFrozen.status).toBe(409);
    expect(patchFrozen.body.error.code).toBe("SAVINGS_GOAL_CLOSED");

    const reopened = await request(app.getHttpServer())
      .post(`/api/v1/savings/goals/${goalId}/reopen`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID());
    expect(reopened.status).toBe(200);
    expect(reopened.body.closedAt).toBeNull();

    const afterReopen = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(afterReopen.body.currentBalance).toBe(balanceBeforeClose);

    const reopenAgain = await request(app.getHttpServer())
      .post(`/api/v1/savings/goals/${goalId}/reopen`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID());
    expect(reopenAgain.status).toBe(409);
    expect(reopenAgain.body.error.code).toBe("SAVINGS_GOAL_NOT_CLOSED");
  });

  it("closes with TRANSFER_TO_GOAL: reassigns entries without moving any balance", async () => {
    const sourceId = await createGoal("100000");
    await contribute(sourceId, "100000");
    const targetId = await createGoal("500000");

    const before = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);

    const closed = await request(app.getHttpServer())
      .post(`/api/v1/savings/goals/${sourceId}/close`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ destination: "TRANSFER_TO_GOAL", targetGoalId: targetId });
    expect(closed.status).toBe(200);
    expect(closed.body.closeDestination).toBe("TRANSFER_TO_GOAL");

    const after = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(after.body.currentBalance).toBe(before.body.currentBalance);

    const targetGoal = await request(app.getHttpServer())
      .get(`/api/v1/savings/goals/${targetId}`)
      .set("Cookie", cookies);
    expect(targetGoal.body.savedAmount).toBe("100000.0000");

    const sourceGoal = await request(app.getHttpServer())
      .get(`/api/v1/savings/goals/${sourceId}`)
      .set("Cookie", cookies);
    expect(sourceGoal.body.savedAmount).toBe("0.0000");
  });

  it("rejects TRANSFER_TO_GOAL toward a different-currency goal", async () => {
    const sourceId = await createGoal("100000");
    await contribute(sourceId, "100000");
    const usdTarget = await request(app.getHttpServer())
      .post("/api/v1/savings/goals")
      .set("Cookie", cookies)
      .send({ title: "USD goal", targetAmount: "500", currency: "USD" });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/savings/goals/${sourceId}/close`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ destination: "TRANSFER_TO_GOAL", targetGoalId: usdTarget.body.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SAVINGS_GOAL_TARGET_CURRENCY_MISMATCH");
  });
});

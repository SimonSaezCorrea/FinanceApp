import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { UUID_V7 } from "../../support/uuid";

/**
 * E2E test (mirrors transactions'/accounts' T037/T046): full create/pay/unpay/
 * update/delete HTTP flows through the migrated Facade controller — must
 * behave identically to the pre-migration `InstallmentsController`/
 * `InstallmentsService`. Requires a reachable Postgres (real test DB), not
 * part of `test:unit`.
 */
describe("Installments HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_inst_${randomUUID()}@test.local`;
  const otherEmail = `e2e_inst_other_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let planId: string;
  let accountId: string;
  let creditAccountId: string;
  let foreignAccountId: string;
  let foreignCardId: string;

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
      .send({ email, password, name: "E2E Installments User" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    // Paying an instalment moves real money, so the flow needs a real account —
    // and a credit-card one to check the refusal of paying debt with debt.
    const account = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Cuenta Corriente",
        type: "CHECKING",
        currency: "USD",
        accountNumber: "1234",
        initialBalance: "5000",
      });
    accountId = account.body.id;

    const credit = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Visa Credito",
        type: "CREDIT_CARD",
        currency: "USD",
        creditLimit: "3000",
      });
    creditAccountId = credit.body.id;

    const registerOther = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: otherEmail, password, name: "Other" });
    const otherCookies = registerOther.get("Set-Cookie") ?? [];
    const otherAccount = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", otherCookies)
      .send({ name: "Other's account", type: "CHECKING", currency: "USD", accountNumber: "999" });
    foreignAccountId = otherAccount.body.id;
    const otherCredit = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", otherCookies)
      .send({
        name: "Other's Visa",
        type: "CREDIT_CARD",
        currency: "USD",
        cards: [
          {
            name: "Other's card",
            kind: "CREDIT",
            last4: "9999",
            expiryMonth: 12,
            expiryYear: 2030,
            limits: [{ currency: "USD", limitAmount: "1000" }],
          },
        ],
      });
    foreignCardId = otherCredit.body.cards[0].id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.installmentPlan.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({
      where: { user: { email: { in: [email, otherEmail] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  it("creates a plan with an equal-principal schedule", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/installments")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        title: "Laptop",
        totalPrincipal: "1200",
        installmentCount: 3,
        startDate: "2026-01-15T00:00:00.000Z",
        currency: "USD",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        category: "Tecnologia",
      });
    expect(res.status).toBe(201);
    planId = res.body.id;
    expect(res.body.payments).toHaveLength(3);
    expect(res.body.payments.map((p: { amount: string }) => p.amount)).toEqual([
      "400.0000",
      "400.0000",
      "400.0000",
    ]);
  });

  // Principle II: a body-supplied FK must be ownership-verified before persisting,
  // and a null-returning resolver (kindForCard) must not be conflated with "no
  // card was sent" — a foreign cardId used to be silently written anyway.
  it("rejects creating a plan with another user's cardId", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/installments")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        title: "Foreign card",
        totalPrincipal: "300",
        installmentCount: 3,
        startDate: "2026-01-15T00:00:00.000Z",
        currency: "USD",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        cardId: foreignCardId,
      });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CARD_NOT_FOUND");
  });

  it("rejects creating a plan with another user's paymentAccountId", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/installments")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        title: "Foreign account",
        totalPrincipal: "300",
        installmentCount: 3,
        startDate: "2026-01-15T00:00:00.000Z",
        currency: "USD",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        paymentAccountId: foreignAccountId,
      });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });

  it("rejects patching a plan onto another user's paymentAccountId", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/installments/${planId}`)
      .set("Cookie", cookies)
      .send({ paymentAccountId: foreignAccountId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });

  it("returns INSTALLMENT_PAYMENT_NOT_FOUND for an unknown sequence", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/installments/${planId}/payments/99/pay`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fromAccountId: accountId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("INSTALLMENT_PAYMENT_NOT_FOUND");
  });

  // FR-034: a plan that records a movement needs to know which account it comes out
  // of; there is no sensible default to invent.
  it("refuses to pay without an account", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/installments/${planId}/payments/1/pay`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INSTALLMENT_PAYMENT_ACCOUNT_REQUIRED");
  });

  // FR-028b: settling debt with debt records no outflow and distorts the pool.
  it("refuses a credit-card account as the source", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/installments/${planId}/payments/1/pay`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fromAccountId: creditAccountId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSTALLMENT_PAYMENT_FROM_CREDIT_ACCOUNT");
  });

  it("pays the first installment and records a real expense", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/installments/${planId}/payments/1/pay`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fromAccountId: accountId, paidAt: "2026-01-16T00:00:00.000Z" });
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/installments/${planId}`)
      .set("Cookie", cookies);
    expect(getRes.body.payments[0].paidAt).not.toBeNull();
    expect(getRes.body.payments[0].paidAmount).toBe("400.0000");

    // FR-027: recognisable in Movements as an ordinary expense of that account.
    const movements = await request(app.getHttpServer())
      .get(`/api/v1/transactions?bankAccountId=${accountId}`)
      .set("Cookie", cookies);
    const expense = movements.body.items.find(
      (t: { installmentPlanId: string | null }) => t.installmentPlanId === planId,
    );
    expect(expense).toBeDefined();
    expect(expense.type).toBe("EXPENSE");
    expect(expense.amount).toBe("400.0000");
    expect(expense.category).toBe("Tecnologia");
    expect(expense.description).toContain("1/3");
    // specs/016 US2: the transaction pay-installment mints is UUID v7, not v4.
    expect(expense.id).toMatch(UUID_V7);

    // And the money really left the account.
    const account = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(Number(account.body.currentBalance)).toBe(4600);
  });

  // INV-C3: the first defence against a double click becoming a double expense.
  it("refuses to pay the same installment twice", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/installments/${planId}/payments/1/pay`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fromAccountId: accountId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSTALLMENT_PAYMENT_ALREADY_PAID");
  });

  // FR-028a: the movement backing an instalment is corrected from its plan, never
  // from Movements.
  it("refuses to edit or delete the movement backing the installment", async () => {
    const movements = await request(app.getHttpServer())
      .get(`/api/v1/transactions?bankAccountId=${accountId}`)
      .set("Cookie", cookies);
    const expense = movements.body.items.find(
      (t: { installmentPlanId: string | null }) => t.installmentPlanId === planId,
    );

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${expense.id}`)
      .set("Cookie", cookies)
      .send({ amount: "500" });
    expect(patched.status).toBe(409);
    expect(patched.body.error.code).toBe("TRANSACTION_LINKED_TO_INSTALLMENT");

    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/transactions/${expense.id}`)
      .set("Cookie", cookies);
    expect(deleted.status).toBe(409);
    expect(deleted.body.error.code).toBe("TRANSACTION_LINKED_TO_INSTALLMENT");
  });

  it("unpays the first installment, giving the money back", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/installments/${planId}/payments/1/unpay`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/installments/${planId}`)
      .set("Cookie", cookies);
    expect(getRes.body.payments[0].paidAt).toBeNull();

    const movements = await request(app.getHttpServer())
      .get(`/api/v1/transactions?bankAccountId=${accountId}`)
      .set("Cookie", cookies);
    expect(
      movements.body.items.filter(
        (t: { installmentPlanId: string | null }) => t.installmentPlanId === planId,
      ),
    ).toHaveLength(0);

    const account = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(Number(account.body.currentBalance)).toBe(5000);
  });

  it("updates the plan's scalar fields", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/installments/${planId}`)
      .set("Cookie", cookies)
      .send({ title: "Renamed laptop" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Renamed laptop");
  });

  it("deletes the plan", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/installments/${planId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);
  });

  it("returns INSTALLMENT_PLAN_NOT_FOUND for a deleted/unknown id", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/installments/${planId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("INSTALLMENT_PLAN_NOT_FOUND");
  });

  // specs/016: unified row identifiers.
  it("rejects a malformed paymentAccountId body field with 400 INVALID_ID_FORMAT", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/installments")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        title: "Vacuum",
        totalPrincipal: "300",
        installmentCount: 3,
        startDate: "2026-01-15T00:00:00.000Z",
        currency: "USD",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        paymentAccountId: "not-a-real-id",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "INVALID_ID_FORMAT", field: "paymentAccountId" });
  });
});

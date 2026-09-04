import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/**
 * E2E test (T046, mirrors accounts' T037/SC-001): full create/update/delete
 * HTTP flows through the migrated Facade controller — must behave
 * identically to the pre-migration `TransactionsController`/`TransactionsService`.
 * Requires a reachable Postgres (real test DB), not part of `test:unit`.
 */
describe("Transactions HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_tx_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let creditAccountId: string;
  let cardId: string;
  let txId: string;

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
      .send({ email, password, name: "E2E Tx User" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const accountRes = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Credit line",
        type: "CREDIT_CARD",
        currency: "CLP",
        cards: [
          {
            name: "Main card",
            kind: "CREDIT",
            last4: "1234",
            expiryMonth: 12,
            expiryYear: 2030,
            limits: [{ currency: "CLP", limitAmount: "500000" }],
          },
        ],
      });
    creditAccountId = accountRes.body.id;
    cardId = accountRes.body.cards[0].id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { bankAccount: { user: { email } } } });
    await prisma.creditStatement.deleteMany({ where: { account: { user: { email } } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("rejects a credit-line expense with no card (CARD_REQUIRED)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        type: "EXPENSE",
        amount: "1000",
        currency: "CLP",
        occurredAt: new Date().toISOString(),
        bankAccountId: creditAccountId,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CARD_REQUIRED");
  });

  it("creates a credit-line expense, incrementing the account's creditUsed", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        type: "EXPENSE",
        amount: "100000",
        currency: "CLP",
        occurredAt: new Date().toISOString(),
        bankAccountId: creditAccountId,
        cardId,
      });
    expect(res.status).toBe(201);
    txId = res.body.id;

    const accountRes = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}`)
      .set("Cookie", cookies);
    expect(accountRes.body.creditUsed).toBe("100000.0000");
  });

  it("edits the transaction's amount and nets the creditUsed delta", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${txId}`)
      .set("Cookie", cookies)
      .send({ amount: "150000" });
    expect(res.status).toBe(200);

    const accountRes = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}`)
      .set("Cookie", cookies);
    expect(accountRes.body.creditUsed).toBe("150000.0000");
  });

  it("deletes the transaction, reverting its contribution", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/transactions/${txId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);

    const accountRes = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}`)
      .set("Cookie", cookies);
    expect(accountRes.body.creditUsed).toBe("0.0000");
  });

  it("keeps the account's balance in step with its movements, with no reconcile step", async () => {
    const accountRes = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Checking balance",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "111-2",
        accountAlias: null,
        initialBalance: "100000",
        overdraftLimit: "0",
        balanceCeiling: null,
      });
    const accountId = accountRes.body.id;
    expect(accountRes.body.currentBalance).toBe("100000.0000");

    const income = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        bankAccountId: accountId,
        type: "INCOME",
        amount: "50000",
        currency: "CLP",
        occurredAt: new Date().toISOString(),
      });
    expect(income.status).toBe(201);

    const expense = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        bankAccountId: accountId,
        type: "EXPENSE",
        amount: "20000",
        currency: "CLP",
        occurredAt: new Date().toISOString(),
      });

    const afterBoth = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(afterBoth.body.currentBalance).toBe("130000.0000");

    // Editing re-applies the difference...
    await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${expense.body.id}`)
      .set("Cookie", cookies)
      .send({ amount: "30000" });
    const afterEdit = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(afterEdit.body.currentBalance).toBe("120000.0000");

    // ...and deleting gives it back.
    await request(app.getHttpServer())
      .delete(`/api/v1/transactions/${expense.body.id}`)
      .set("Cookie", cookies);
    const afterDelete = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(afterDelete.body.currentBalance).toBe("150000.0000");
  });

  it("returns TRANSACTION_NOT_FOUND for a deleted/unknown id", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/transactions/${txId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TRANSACTION_NOT_FOUND");
  });

  // specs/016: unified row identifiers.
  it("rejects a malformed bankAccountId body field with 400 INVALID_ID_FORMAT before persisting", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        type: "EXPENSE",
        amount: "10.00",
        currency: "CLP",
        bankAccountId: "not-a-real-id",
        occurredAt: "2026-08-01T00:00:00.000Z",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "INVALID_ID_FORMAT", field: "bankAccountId" });
  });

  it("still routes GET /transactions/summary to the summary handler, never misread as :id", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/transactions/summary")
      .set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("currencyTotals");
  });
});

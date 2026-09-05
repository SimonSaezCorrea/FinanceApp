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
 * E2E test (mirrors installments'/accounts' T037/T047): full create/settle/
 * unsettle/register-payment/undo-payment/update/delete HTTP flows through the
 * migrated Facade controller — must behave identically to the pre-migration
 * `DebtsController`/`DebtsService`. Requires a reachable Postgres (real test
 * DB), not part of `test:unit`.
 */
describe("Debts HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_debts_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let debtId: string;
  let accountId: string;

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
      .send({ email, password, name: "E2E Debts User" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const accountRes = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Cuenta Corriente",
        type: "CHECKING",
        currency: "USD",
        accountNumber: "1234",
        initialBalance: "0",
      });
    accountId = accountRes.body.id;
  });

  afterAll(async () => {
    await prisma.debt.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("creates a debt with 3 installments", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/debts")
      .set("Cookie", cookies)
      .send({
        direction: "YOU_OWE",
        counterparty: "Acme Corp",
        principal: "1200",
        currency: "USD",
        openedAt: "2026-01-01T00:00:00.000Z",
        totalInstallments: 3,
        frequency: "MONTHLY",
        frequencyInterval: 1,
      });
    expect(res.status).toBe(201);
    debtId = res.body.id;
    expect(res.body.paidInstallments).toBe(0);
    expect(res.body.settledAt).toBeNull();
  });

  it("returns DEBT_NOT_FOUND for a well-formed but nonexistent id", async () => {
    const res = await request(app.getHttpServer())
      // specs/016: a malformed id ("ghost") is now rejected earlier with
      // INVALID_ID_FORMAT — this well-formed UUID v7 exercises the NOT_FOUND
      // path specifically.
      .get("/api/v1/debts/018f6b9a-2c3e-7c21-9e4a-1f2b3c4d5e6f")
      .set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("DEBT_NOT_FOUND");
  });

  it("returns VALIDATION_ERROR when register-payment is called without an accountId", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/debts/${debtId}/register-payment`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({});
    expect(res.status).toBe(400);
  });

  it("registers a payment and records a real movement on the account", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/debts/${debtId}/register-payment`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ accountId });
    expect(res.status).toBe(200);
    expect(res.body.paidInstallments).toBe(1);
    expect(res.body.settledAt).toBeNull();
    expect(res.body.lastPaymentTransactionId).not.toBeNull();
    expect(res.body.lastPaymentAccountId).toBe(accountId);
    // YOU_OWE, no installmentAmount: one instalment = 1200 / 3 = 400, an EXPENSE.
    expect(res.body.lastPaymentAmount).toBe("400.0000");

    // The movement itself is traceable back to this debt (specs conversation
    // "¿No genera movimiento marcarla como pagada?" → Movements' "Origen").
    const listRes = await request(app.getHttpServer())
      .get("/api/v1/transactions")
      .set("Cookie", cookies);
    const movement = listRes.body.items.find(
      (t: { id: string }) => t.id === res.body.lastPaymentTransactionId,
    );
    expect(movement).toBeDefined();
    expect(movement.debtId).toBe(debtId);

    const accountRes = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(accountRes.body.currentBalance).toBe("-400.0000");
  });

  it("undoes the payment and reverses the movement", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/debts/${debtId}/undo-payment`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(200);
    expect(res.body.paidInstallments).toBe(0);
    expect(res.body.lastPaymentTransactionId).toBeNull();

    const accountRes = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(accountRes.body.currentBalance).toBe("0.0000");
  });

  it("returns NO_PAYMENTS_TO_UNDO when undoing with nothing paid", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/debts/${debtId}/undo-payment`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NO_PAYMENTS_TO_UNDO");
  });

  it("settles the debt directly and records the full remaining amount", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/debts/${debtId}/settle`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ accountId });
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${debtId}`)
      .set("Cookie", cookies);
    expect(getRes.body.settledAt).not.toBeNull();
    expect(getRes.body.lastPaymentAmount).toBe("1200.0000");

    const accountRes = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(accountRes.body.currentBalance).toBe("-1200.0000");
  });

  it("returns DEBT_ALREADY_SETTLED when registering a payment on a settled debt", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/debts/${debtId}/register-payment`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ accountId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DEBT_ALREADY_SETTLED");
  });

  it("unsettles the debt and reverses the recorded movement", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/debts/${debtId}/unsettle`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(200);
    expect(res.body.settledAt).toBeNull();
    expect(res.body.lastPaymentTransactionId).toBeNull();

    const accountRes = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(accountRes.body.currentBalance).toBe("0.0000");
  });

  it("returns DEBT_NOT_SETTLED when unsettling an already-open debt", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/debts/${debtId}/unsettle`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DEBT_NOT_SETTLED");
  });

  it("updates the debt's scalar fields", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/debts/${debtId}`)
      .set("Cookie", cookies)
      .send({ counterparty: "Acme Corp Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.counterparty).toBe("Acme Corp Renamed");
  });

  it("deletes the debt", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/debts/${debtId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);
  });

  it("returns DEBT_NOT_FOUND for a deleted/unknown id", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/debts/${debtId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("DEBT_NOT_FOUND");
  });

  // specs/016: unified row identifiers.
  it("rejects a malformed :id with 400 INVALID_ID_FORMAT", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/debts/not-a-real-id")
      .set("Cookie", cookies);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "INVALID_ID_FORMAT", field: "id" });
  });
});

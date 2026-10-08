import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { categoryIdFor } from "../../../integration/support/repositories";
import { randomValidRut } from "../../support/rut";

/**
 * Spec 030 (absorbing spec 028 US2) through the real HTTP surface: a card with a USD limit
 * charges in dollars, the period is generated, and the statement is PAID from a CLP account
 * with two amounts; the open USD period is PREPAID the same way. Requires a reachable, seeded
 * Postgres (not part of `test:unit`).
 */
describe("Statements in another currency (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_fx_billing_${randomUUID()}@test.local`;
  let cookies: string[] = [];
  let creditAccountId: string;
  let cardId: string;
  let fromAccountId: string;
  let usdStatementId: string;
  let categoryId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    categoryId = await categoryIdFor(prisma, "SUBSCRIPTIONS");

    const registerRes = await http().post("/api/v1/auth/register").send({
      email,
      password: "Sup3rSecret!",
      name: "E2E FX Billing User",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: randomValidRut(),
    });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const from = await http()
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Cuenta Corriente",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "123",
        initialBalance: "1000000",
      });
    fromAccountId = from.body.id;

    const credit = await http()
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "BCI Platinum",
        type: "CREDIT_CARD",
        currency: "CLP",
        cards: [
          {
            name: "Visa",
            kind: "CREDIT",
            last4: "7774",
            expiryMonth: 6,
            expiryYear: 2031,
            limits: [
              { currency: "CLP", limitAmount: "900000" },
              { currency: "USD", limitAmount: "100" },
            ],
          },
        ],
      });
    creditAccountId = credit.body.id;
    cardId = credit.body.cards[0].id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.creditStatement.deleteMany({ where: { account: { user: { email } } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const chargeUsd = (amount: string) =>
    http()
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        type: "EXPENSE",
        amount,
        currency: "USD",
        occurredAt: "2026-09-20T12:00:00.000Z",
        bankAccountId: creditAccountId,
        cardId,
        categoryId,
        description: "Spotify",
      });

  const sourceBalance = async () =>
    Number(
      (await http().get(`/api/v1/accounts/${fromAccountId}`).set("Cookie", cookies)).body
        .currentBalance,
    );

  it("a USD charge lands on its own USD period and leaves the CLP pool alone", async () => {
    const res = await chargeUsd("50.41");
    expect(res.status).toBe(201);

    const account = await http().get(`/api/v1/accounts/${creditAccountId}`).set("Cookie", cookies);
    expect(Number(account.body.creditUsed)).toBe(0);
  });

  it("generates the period of each currency, and the USD one is payable", async () => {
    const generated = await http()
      .post(`/api/v1/accounts/${creditAccountId}/generate-statements`)
      .set("Cookie", cookies)
      .send({
        periodStart: "2026-09-01T00:00:00.000Z",
        closedAt: "2026-09-30T23:59:59.999Z",
        dueDate: "2026-10-12T23:59:59.999Z",
      });
    expect(generated.status).toBe(201);
    // Generating closes the period AND opens the next one of each currency: the payable one
    // is the USD statement that is now PENDING, not the fresh OPEN one.
    const usd = generated.body.find(
      (s: { currency: string; status: string }) => s.currency === "USD" && s.status === "PENDING",
    );
    expect(usd).toBeDefined();
    expect(Number(usd.amount)).toBeCloseTo(50.41, 2);
    usdStatementId = usd.id;
  });

  it("refuses to pay it from a CLP account without saying what left that account", async () => {
    const res = await http()
      .post(`/api/v1/accounts/${creditAccountId}/credit-statements/${usdStatementId}/pay`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fromAccountId });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("STATEMENT_PAYMENT_CURRENCY_AMBIGUOUS");
  });

  it("pays it with both amounts; a replay with the same key changes nothing", async () => {
    const before = await sourceBalance();
    const key = randomUUID();
    const send = () =>
      http()
        .post(`/api/v1/accounts/${creditAccountId}/credit-statements/${usdStatementId}/pay`)
        .set("Cookie", cookies)
        .set("Idempotency-Key", key)
        .send({ fromAccountId, amount: "50.41", chargedAmount: "49394" });

    const first = await send();
    const replay = await send();

    expect(first.status).toBe(201);
    expect(first.body.status).toBe("PAID");
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(await sourceBalance()).toBe(before - 49394);
    const settlements = await prisma.transaction.count({
      where: { settlesStatementId: usdStatementId },
    });
    expect(settlements).toBe(1);
  });

  it("keeps the settlement INCOME read-only in Movimientos", async () => {
    const income = await prisma.transaction.findFirstOrThrow({
      where: { settlesStatementId: usdStatementId, type: "INCOME" },
    });

    const patched = await http()
      .patch(`/api/v1/transactions/${income.id}`)
      .set("Cookie", cookies)
      .send({ amount: "1" });
    const deleted = await http().delete(`/api/v1/transactions/${income.id}`).set("Cookie", cookies);

    expect(patched.status).toBe(409);
    expect(patched.body.error.code).toBe("TRANSACTION_LINKED_TO_STATEMENT");
    expect(deleted.status).toBe(409);
    expect(deleted.body.error.code).toBe("TRANSACTION_LINKED_TO_STATEMENT");
  });

  it("corrects the payment with both amounts, moving the pesos balance by the difference", async () => {
    const before = await sourceBalance();

    const res = await http()
      .patch(`/api/v1/accounts/${creditAccountId}/credit-statements/${usdStatementId}/payment`)
      .set("Cookie", cookies)
      .send({ amount: "40", chargedAmount: "39200" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PARTIALLY_PAID");
    // 49.394 left before, 39.200 now.
    expect(await sourceBalance()).toBe(before + 10194);
  });

  it("prepays the OPEN USD period with both amounts, closing nothing", async () => {
    await chargeUsd("20");
    const list = await http()
      .get(`/api/v1/accounts/${creditAccountId}/credit-statements`)
      .set("Cookie", cookies);
    const open = list.body.find(
      (s: { currency: string; status: string }) => s.currency === "USD" && s.status === "OPEN",
    );
    expect(open).toBeDefined();
    const before = await sourceBalance();

    const res = await http()
      .post(`/api/v1/accounts/${creditAccountId}/credit-statements/${open.id}/prepay`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fromAccountId, amount: "10", chargedAmount: "9800" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("OPEN");
    expect(res.body.prepaidAmount).toBe("10.0000");
    expect(await sourceBalance()).toBe(before - 9800);
  });
});

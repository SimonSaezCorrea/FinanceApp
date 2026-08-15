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
 * E2E (spec 011): the prepaid ACCOUNT as its own product — only prepaid cards on
 * it, no prepaid card anywhere else, a balance that can't go below zero whatever
 * the channel, funded by an ordinary transfer, and a type that can't be converted.
 * Requires a reachable Postgres, so it is not part of `test:unit`.
 */
describe("Prepaid account HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let prepaidId: string;
  let checkingId: string;
  let prepaidCardId: string;

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const registered = await api()
      .post("/api/v1/auth/register")
      .send({ email, password, name: "E2E Prepaid" });
    cookies = registered.get("Set-Cookie") ?? [];

    const checking = await api().post("/api/v1/accounts").set("Cookie", cookies).send({
      name: "Checking",
      type: "CHECKING",
      currency: "CLP",
      accountNumber: "001-2",
      initialBalance: "500000",
    });
    checkingId = checking.body.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("creates a prepaid account with an inline prepaid card", async () => {
    const res = await api()
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Tenpo Prepago",
        type: "PREPAID",
        currency: "CLP",
        accountNumber: "TP-1",
        initialBalance: "50000",
        cards: [
          { name: "Prepago", kind: "PREPAID", last4: "8890", expiryMonth: 3, expiryYear: 2030 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("PREPAID");
    expect(res.body.currentBalance).toBe("50000.0000");
    expect(res.body.cards).toHaveLength(1);
    prepaidId = res.body.id;
    prepaidCardId = res.body.cards[0].id;
  });

  it("rejects a negative initial balance on a prepaid account", async () => {
    const res = await api().post("/api/v1/accounts").set("Cookie", cookies).send({
      name: "Bad",
      type: "PREPAID",
      currency: "CLP",
      accountNumber: "TP-2",
      initialBalance: "-1",
    });
    expect(res.status).toBe(400);
  });

  it("accepts a second prepaid card, both sharing the account's balance", async () => {
    const res = await api()
      .post(`/api/v1/accounts/${prepaidId}/cards`)
      .set("Cookie", cookies)
      .send({ name: "Virtual", kind: "PREPAID", last4: "2043", expiryMonth: 9, expiryYear: 2031 });
    expect(res.status).toBe(201);

    const account = await api().get(`/api/v1/accounts/${prepaidId}`).set("Cookie", cookies);
    expect(account.body.cards).toHaveLength(2);
  });

  it("refuses a CREDIT or DEBIT card on a prepaid account", async () => {
    for (const kind of ["CREDIT", "DEBIT"]) {
      const res = await api()
        .post(`/api/v1/accounts/${prepaidId}/cards`)
        .set("Cookie", cookies)
        .send({
          name: kind,
          kind,
          last4: "1111",
          expiryMonth: 1,
          expiryYear: 2031,
          limits: [{ currency: "CLP", limitAmount: "100000" }],
        });
      expect(res.body.error?.code).toBe("CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT");
    }
  });

  it("refuses a PREPAID card on a checking account", async () => {
    const res = await api()
      .post(`/api/v1/accounts/${checkingId}/cards`)
      .set("Cookie", cookies)
      .send({ name: "Nope", kind: "PREPAID", last4: "2222", expiryMonth: 1, expiryYear: 2031 });
    expect(res.body.error?.code).toBe("CARD_KIND_NOT_ALLOWED_FOR_ACCOUNT");
  });

  it("spends down the account's balance, and refuses to go below zero", async () => {
    const ok = await api().post("/api/v1/transactions").set("Cookie", cookies).send({
      type: "EXPENSE",
      amount: "20000",
      currency: "CLP",
      occurredAt: new Date().toISOString(),
      category: "Restaurantes",
      description: "Almuerzo",
      bankAccountId: prepaidId,
      cardId: prepaidCardId,
    });
    expect(ok.status).toBe(201);

    const after = await api().get(`/api/v1/accounts/${prepaidId}`).set("Cookie", cookies);
    expect(after.body.currentBalance).toBe("30000.0000");

    const tooMuch = await api().post("/api/v1/transactions").set("Cookie", cookies).send({
      type: "EXPENSE",
      amount: "30000.01",
      currency: "CLP",
      occurredAt: new Date().toISOString(),
      category: "Otros",
      description: "Demasiado",
      bankAccountId: prepaidId,
      cardId: prepaidCardId,
    });
    expect(tooMuch.body.error?.code).toBe("PREPAID_INSUFFICIENT_BALANCE");

    // …and with no card either: the rule belongs to the account, not the plastic.
    const noCard = await api().post("/api/v1/transactions").set("Cookie", cookies).send({
      type: "EXPENSE",
      amount: "999999",
      currency: "CLP",
      occurredAt: new Date().toISOString(),
      category: "Otros",
      description: "Sin tarjeta",
      bankAccountId: prepaidId,
    });
    expect(noCard.body.error?.code).toBe("PREPAID_INSUFFICIENT_BALANCE");
  });

  it("is topped up by an ordinary transfer, and bounds an outgoing one", async () => {
    const load = await api().post("/api/v1/transactions/transfers").set("Cookie", cookies).send({
      fromBankAccountId: checkingId,
      toBankAccountId: prepaidId,
      amountOut: "40000",
      amountIn: "40000",
      currencyOut: "CLP",
      currencyIn: "CLP",
      occurredAt: new Date().toISOString(),
      category: "Traspaso",
      description: "Carga",
    });
    expect(load.status).toBe(201);

    const after = await api().get(`/api/v1/accounts/${prepaidId}`).set("Cookie", cookies);
    expect(after.body.currentBalance).toBe("70000.0000");

    const tooMuch = await api().post("/api/v1/transactions/transfers").set("Cookie", cookies).send({
      fromBankAccountId: prepaidId,
      toBankAccountId: checkingId,
      amountOut: "70000.01",
      amountIn: "70000.01",
      currencyOut: "CLP",
      currencyIn: "CLP",
      occurredAt: new Date().toISOString(),
      category: "Traspaso",
      description: "De vuelta",
    });
    expect(tooMuch.body.error?.code).toBe("PREPAID_INSUFFICIENT_BALANCE");
  });

  it("no longer exposes a card top-up endpoint", async () => {
    const res = await api()
      .post(`/api/v1/accounts/${prepaidId}/cards/${prepaidCardId}/load`)
      .set("Cookie", cookies)
      .send({ amount: "1000" });
    expect(res.status).toBe(404);
  });

  it("refuses to convert the account type in either direction", async () => {
    const toChecking = await api()
      .patch(`/api/v1/accounts/${prepaidId}`)
      .set("Cookie", cookies)
      .send({ type: "CHECKING" });
    expect(toChecking.body.error?.code).toBe("ACCOUNT_TYPE_CHANGE_NOT_ALLOWED");

    const toPrepaid = await api()
      .patch(`/api/v1/accounts/${checkingId}`)
      .set("Cookie", cookies)
      .send({ type: "PREPAID" });
    expect(toPrepaid.body.error?.code).toBe("ACCOUNT_TYPE_CHANGE_NOT_ALLOWED");
  });

  it("deactivates like any other account (no rules of its own)", async () => {
    const res = await api()
      .post(`/api/v1/accounts/${prepaidId}/status`)
      .set("Cookie", cookies)
      .send({ status: "INACTIVE" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("INACTIVE");

    await api()
      .post(`/api/v1/accounts/${prepaidId}/status`)
      .set("Cookie", cookies)
      .send({ status: "ACTIVE" });
  });
});

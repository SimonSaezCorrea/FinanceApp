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
 * Run-3 hardening: the balance rules are checked again on the account row LOCKED inside the
 * write's transaction, so movements sent at the same time can't each pass a stale check and
 * together leave a prepaid account below zero.
 */
describe("Concurrent movements against an account's limits (e2e)", { timeout: 30_000 }, () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_limits_${randomUUID()}@test.local`;
  let cookies: string[] = [];

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    const registered = await api().post("/api/v1/auth/register").send({
      email,
      password: "Sup3rSecret!",
      name: "E2E Limits",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: randomValidRut(),
    });
    cookies = registered.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.creditStatement.deleteMany({ where: { account: { user: { email } } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.idempotencyRecord.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("5 simultaneous expenses of 400 on a prepaid account holding 1,000: at most 2 pass", async () => {
    const created = await api().post("/api/v1/accounts").set("Cookie", cookies).send({
      name: "Prepago",
      type: "PREPAID",
      currency: "CLP",
      accountNumber: "TP-9",
      accountAlias: null,
      initialBalance: "1000",
    });
    expect(created.status).toBe(201);
    const accountId = created.body.id as string;
    const categoryId = await categoryIdFor(prisma, "RESTAURANTS");

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api()
          .post("/api/v1/transactions")
          .set("Cookie", cookies)
          .set("Idempotency-Key", randomUUID())
          .send({
            type: "EXPENSE",
            amount: "400",
            currency: "CLP",
            occurredAt: new Date().toISOString(),
            categoryId,
            description: "Café",
            bankAccountId: accountId,
          }),
      ),
    );

    const accepted = results.filter((r) => r.status === 201).length;
    expect(accepted).toBe(2);
    for (const r of results.filter((x) => x.status !== 201)) {
      expect(r.body.error.code).toBe("PREPAID_INSUFFICIENT_BALANCE");
    }
    const account = await api().get(`/api/v1/accounts/${accountId}`).set("Cookie", cookies);
    expect(Number(account.body.currentBalance)).toBe(200);
  });

  it("5 simultaneous transfers of 400 out of a prepaid account holding 1,000: at most 2 pass", async () => {
    const prepaid = await api().post("/api/v1/accounts").set("Cookie", cookies).send({
      name: "Prepago traspasos",
      type: "PREPAID",
      currency: "CLP",
      accountNumber: "TP-10",
      accountAlias: null,
      initialBalance: "1000",
    });
    const checking = await api().post("/api/v1/accounts").set("Cookie", cookies).send({
      name: "Corriente destino",
      type: "CHECKING",
      currency: "CLP",
      accountNumber: "CC-10",
      accountAlias: null,
      initialBalance: "0",
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api()
          .post("/api/v1/transactions/transfers")
          .set("Cookie", cookies)
          .set("Idempotency-Key", randomUUID())
          .send({
            fromBankAccountId: prepaid.body.id,
            toBankAccountId: checking.body.id,
            amountOut: "400",
            amountIn: "400",
            currencyOut: "CLP",
            currencyIn: "CLP",
            occurredAt: new Date().toISOString(),
          }),
      ),
    );
    expect(results.filter((r) => r.status === 201).length).toBe(2);
    const account = await api().get(`/api/v1/accounts/${prepaid.body.id}`).set("Cookie", cookies);
    expect(Number(account.body.currentBalance)).toBe(200);
  });

  it("5 simultaneous purchases of 400 on an additional card limited to 1,000: at most 2 pass", async () => {
    const card = (name: string, last4: string, extra: Record<string, unknown> = {}) => ({
      name,
      kind: "CREDIT",
      last4,
      expiryMonth: 12,
      expiryYear: 2030,
      ...extra,
    });
    const created = await api()
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Tarjeta de crédito",
        type: "CREDIT_CARD",
        currency: "CLP",
        creditLimit: "1000000",
        cards: [
          card("Titular", "1111"),
          card("Adicional", "2222", {
            isAdditional: true,
            usesAccountPool: false,
            limits: [{ currency: "CLP", limitAmount: "1000" }],
          }),
        ],
      });
    expect(created.status).toBe(201);
    const additional = (created.body.cards as { id: string; last4: string }[]).find(
      (c) => c.last4 === "2222",
    )!;
    const categoryId = await categoryIdFor(prisma, "RESTAURANTS");
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api()
          .post("/api/v1/transactions")
          .set("Cookie", cookies)
          .set("Idempotency-Key", randomUUID())
          .send({
            type: "EXPENSE",
            amount: "400",
            currency: "CLP",
            occurredAt: new Date().toISOString(),
            categoryId,
            description: "Compra",
            bankAccountId: created.body.id,
            cardId: additional.id,
          }),
      ),
    );
    expect(results.filter((r) => r.status === 201).length).toBe(2);
    for (const r of results.filter((x) => x.status !== 201)) {
      expect(r.body.error.code).toBe("CARD_SUBLIMIT_EXCEEDED");
    }
  });
});

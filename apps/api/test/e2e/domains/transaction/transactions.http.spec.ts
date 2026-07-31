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
        type: "CREDIT_LINE",
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
      .send({ type: "EXPENSE", amount: "1000", currency: "CLP", occurredAt: new Date().toISOString(), bankAccountId: creditAccountId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CARD_REQUIRED");
  });

  it("creates a credit-line expense, incrementing the account's creditUsed", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
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

    const accountRes = await request(app.getHttpServer()).get(`/api/v1/accounts/${creditAccountId}`).set("Cookie", cookies);
    expect(accountRes.body.creditUsed).toBe("100000.0000");
  });

  it("edits the transaction's amount and nets the creditUsed delta", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${txId}`)
      .set("Cookie", cookies)
      .send({ amount: "150000" });
    expect(res.status).toBe(200);

    const accountRes = await request(app.getHttpServer()).get(`/api/v1/accounts/${creditAccountId}`).set("Cookie", cookies);
    expect(accountRes.body.creditUsed).toBe("150000.0000");
  });

  it("deletes the transaction, reverting its contribution", async () => {
    const res = await request(app.getHttpServer()).delete(`/api/v1/transactions/${txId}`).set("Cookie", cookies);
    expect(res.status).toBe(204);

    const accountRes = await request(app.getHttpServer()).get(`/api/v1/accounts/${creditAccountId}`).set("Cookie", cookies);
    expect(accountRes.body.creditUsed).toBe("0.0000");
  });

  it("returns TRANSACTION_NOT_FOUND for a deleted/unknown id", async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/transactions/${txId}`).set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TRANSACTION_NOT_FOUND");
  });
});

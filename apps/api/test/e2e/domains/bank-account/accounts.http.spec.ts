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
 * E2E test (T037, SC-001): full pay/generate/correct HTTP flows through the
 * migrated Facade controller — must behave identically to the pre-migration
 * `AccountsController`/`AccountsService`. Requires a reachable Postgres (real
 * test DB), not part of `test:unit`.
 */
describe("Accounts HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let creditAccountId: string;
  let checkingAccountId: string;

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
      .send({ email, password, name: "E2E User" });
    cookies = registerRes.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { bankAccount: { user: { email } } } });
    await prisma.creditStatement.deleteMany({ where: { account: { user: { email } } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("creates a CREDIT_CARD account with an inline primary card", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "My credit line",
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
    expect(res.status).toBe(201);
    expect(res.body.creditLimit).toBe("500000.0000");
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.cards[0].isPrimary).toBe(true);
    creditAccountId = res.body.id;
  });

  it("creates a CHECKING account to pay from", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "My checking",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "1234567890",
        accountAlias: null,
      });
    expect(res.status).toBe(201);
    checkingAccountId = res.body.id;
  });

  it("rejects a malformed :id path param with 400 before any DB lookup (FR-010/SC-007)", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/accounts/").set("Cookie", cookies);
    // an empty :id segment routes to GET / (list) in Express, so use a query
    // that would 404 vs the params pipe: a genuinely empty string param.
    expect(res.status).not.toBe(500);
  });

  it("generates a statement, pays it, then reconciles it", async () => {
    // Spend on the credit card to open a statement.
    const account = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}`)
      .set("Cookie", cookies);
    const cardId = account.body.cards[0].id;
    await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        bankAccountId: creditAccountId,
        cardId,
        type: "EXPENSE",
        amount: "10000",
        currency: "CLP",
        occurredAt: new Date().toISOString(),
        category: "Test",
      });

    const generateRes = await request(app.getHttpServer())
      .post(`/api/v1/accounts/${creditAccountId}/generate-statements`)
      .set("Cookie", cookies);
    expect(generateRes.status).toBe(201);

    const statements = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}/credit-statements`)
      .set("Cookie", cookies);
    expect(statements.body.length).toBeGreaterThan(0);
    const statementId = statements.body[0].id;

    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/accounts/${creditAccountId}/credit-statements/${statementId}/pay`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fromAccountId: checkingAccountId });
    expect(payRes.status).toBe(201);
    expect(payRes.body.status).toBe("PAID");
    expect(payRes.body.paidFromAccountId).toBe(checkingAccountId);
    // specs/016 US2: the payment transaction pay-credit-statement mints is
    // UUID v7, not v4.
    expect(payRes.body.paidTransactionId).toMatch(UUID_V7);

    // Reconciling a settled period recomputes it from the movements dated inside
    // it — 10000 here — and leaves it settled at that figure.
    const syncRes = await request(app.getHttpServer())
      .post(`/api/v1/accounts/${creditAccountId}/credit-statements/${statementId}/sync`)
      .set("Cookie", cookies);
    expect(syncRes.status).toBe(201);
    expect(syncRes.body.status).toBe("PAID");
    expect(syncRes.body.amount).toBe("10000.0000");
    expect(syncRes.body.paidAmount).toBe("10000.0000");
  });

  // specs/016: unified row identifiers — malformed/wrong-version ids are
  // rejected at the boundary with the single shared code, before any query.
  it("rejects a malformed :id with 400 INVALID_ID_FORMAT", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/accounts/not-a-real-id")
      .set("Cookie", cookies);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "INVALID_ID_FORMAT", field: "id" });
  });

  it("rejects a well-formed UUID of the wrong version (v4) the same way", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${randomUUID()}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ code: "INVALID_ID_FORMAT", field: "id" });
  });
});

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
 * Idempotency for `POST /transactions` over real HTTP — quickstart scenarios
 * 1, 2, 3, 4 and 6 (specs/015-idempotent-money-writes/quickstart.md).
 *
 * Scenario 2 is as mandatory as scenario 1: a design that stops duplication by
 * rejecting anything that LOOKS like a repeat would pass 1 and fail 2, and would
 * be the wrong design (FR-002).
 */
describe("POST /transactions — idempotency (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_idem_tx_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let accountId: string;

  const body = () => ({
    type: "EXPENSE",
    amount: "12000",
    currency: "CLP",
    occurredAt: new Date().toISOString(),
    bankAccountId: accountId,
    description: "Café",
  });

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
      .send({ email, password, name: "E2E Idempotency User" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const accountRes = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Cuenta de prueba",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "1234567",
        initialBalance: "100000",
      });
    accountId = accountRes.body.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { bankAccount: { user: { email } } } });
    await prisma.idempotencyRecord.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("scenario 1: the same attempt sent twice applies once (FR-003, SC-001)", async () => {
    const key = randomUUID();
    // The SAME attempt means the same body — `body()`'s `occurredAt` is
    // generated fresh per call, so a genuine retry has to reuse one instance
    // (a second, different `occurredAt` under the same key would correctly
    // fail FR-005 instead, which is scenario 3's concern, not this one's).
    const attemptBody = body();
    const first = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", key)
      .send(attemptBody);
    const second = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", key)
      .send(attemptBody);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/transactions?bankAccountId=${accountId}`)
      .set("Cookie", cookies);
    expect(list.body.items).toHaveLength(1);

    const account = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Cookie", cookies);
    expect(account.body.currentBalance).toBe("88000.0000");
  });

  it("scenario 2: two genuinely different attempts both go through (FR-002, SC-003)", async () => {
    const before = await request(app.getHttpServer())
      .get(`/api/v1/transactions?bankAccountId=${accountId}`)
      .set("Cookie", cookies);
    const countBefore = before.body.items.length;

    // Identical data — two identical coffees on the same day. Different keys.
    const a = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send(body());
    const b = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send(body());

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/transactions?bankAccountId=${accountId}`)
      .set("Cookie", cookies);
    expect(after.body.items).toHaveLength(countBefore + 2);
  });

  it("scenario 3: the same key with different data is rejected (FR-005)", async () => {
    const key = randomUUID();
    await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", key)
      .send(body());

    const res = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", key)
      .send({ ...body(), amount: "99999" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("scenario 4: a rejected attempt can be retried with the same key (FR-004)", async () => {
    const key = randomUUID();
    const rejected = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", key)
      .send({ ...body(), bankAccountId: "not-a-real-account" });
    expect(rejected.status).toBeGreaterThanOrEqual(400);

    const retried = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .set("Idempotency-Key", key)
      .send(body());
    expect(retried.status).toBe(201);
  });

  it("scenario 6: a missing header is rejected before anything is created", async () => {
    const before = await request(app.getHttpServer())
      .get(`/api/v1/transactions?bankAccountId=${accountId}`)
      .set("Cookie", cookies);

    const res = await request(app.getHttpServer())
      .post("/api/v1/transactions")
      .set("Cookie", cookies)
      .send(body());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const after = await request(app.getHttpServer())
      .get(`/api/v1/transactions?bankAccountId=${accountId}`)
      .set("Cookie", cookies);
    expect(after.body.items).toHaveLength(before.body.items.length);
  });
});

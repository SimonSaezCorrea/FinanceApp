import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/**
 * `paidInstallments += 1` is a race that predates this feature: `load` and
 * `save` used to be two unguarded round-trips, so two genuinely concurrent
 * `register-payment` calls could both read the same count and both write
 * `n+1` — a double-click silently registering two payments for one. This is
 * NOT about retry identity (two different keys below, on purpose): it proves
 * the transaction wrapping added alongside idempotency (T048) also closed
 * this older hole.
 */
describe("POST /debts/:id/register-payment — concurrent distinct attempts (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_debt_race_${randomUUID()}@test.local`;
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
      .send({ email, password, name: "Debt race test" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const accountRes = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Cuenta Corriente",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "1234",
        initialBalance: "0",
      });
    accountId = accountRes.body.id;
  });

  afterEach(async () => {
    await prisma.debt.deleteMany({ where: { user: { email } } });
    await prisma.idempotencyRecord.deleteMany({ where: { user: { email } } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("registering N concurrent DISTINCT payments advances the counter by exactly N, never more", async () => {
    const debtRes = await request(app.getHttpServer())
      .post("/api/v1/debts")
      .set("Cookie", cookies)
      .send({
        direction: "YOU_OWE",
        counterparty: "Someone",
        principal: "120000",
        currency: "CLP",
        openedAt: new Date().toISOString(),
        totalInstallments: 12,
        frequency: "MONTHLY",
        frequencyInterval: 1,
      });
    debtId = debtRes.body.id;

    // Six genuinely distinct attempts (own key each) fired together — the
    // case the old unguarded load+save would double-count.
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/debts/${debtId}/register-payment`)
          .set("Cookie", cookies)
          .set("Idempotency-Key", randomUUID())
          .send({ accountId }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 200);
    // Every one of the six is a legitimate, distinct payment — none should be
    // rejected as a duplicate (that would be FR-002 violated the other way).
    expect(succeeded).toHaveLength(6);

    const final = await request(app.getHttpServer())
      .get(`/api/v1/debts/${debtId}`)
      .set("Cookie", cookies);

    // The one invariant that matters: exactly 6, not fewer (lost updates)
    // and not more (double-counted).
    expect(final.body.paidInstallments).toBe(6);
  });
});

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
 * Idempotency for `POST /installments` — quickstart scenario 9, the
 * highest-value case in the whole feature: a CREDIT-card plan's create
 * ALSO commits a purchase movement consuming the full principal from the
 * card's pool in the same transaction (spec 014). A duplicate submit here
 * doesn't just double a row, it doubles committed credit.
 */
describe("POST /installments — idempotency (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_idem_plan_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let creditAccountId: string;
  let cardId: string;

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
      .send({ email, password, name: "E2E Idempotency Plan User" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const accountRes = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Línea de crédito",
        type: "CREDIT_CARD",
        currency: "CLP",
        cards: [
          {
            name: "Visa",
            kind: "CREDIT",
            last4: "1234",
            expiryMonth: 12,
            expiryYear: 2030,
            limits: [{ currency: "CLP", limitAmount: "5000000" }],
          },
        ],
      });
    creditAccountId = accountRes.body.id;
    cardId = accountRes.body.cards[0].id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { bankAccount: { user: { email } } } });
    await prisma.installmentPayment.deleteMany({ where: { plan: { user: { email } } } });
    await prisma.installmentPlan.deleteMany({ where: { user: { email } } });
    await prisma.idempotencyRecord.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("scenario 9: two submissions with the same key leave one plan, one schedule, and the pool consumed exactly once", async () => {
    const key = randomUUID();
    const body = {
      title: "Notebook ASUS",
      totalPrincipal: "1080000",
      installmentCount: 12,
      startDate: new Date().toISOString(),
      currency: "CLP",
      frequency: "MONTHLY",
      frequencyInterval: 1,
      cardId,
    };

    const first = await request(app.getHttpServer())
      .post("/api/v1/installments")
      .set("Cookie", cookies)
      .set("Idempotency-Key", key)
      .send(body);
    const second = await request(app.getHttpServer())
      .post("/api/v1/installments")
      .set("Cookie", cookies)
      .set("Idempotency-Key", key)
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(first.body.payments).toHaveLength(12);

    // One plan, one schedule.
    const plans = await prisma.installmentPlan.findMany({
      where: { user: { email } },
      include: { payments: true },
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.payments).toHaveLength(12);

    // The purchase movement was written once — not twice.
    const purchases = await prisma.transaction.findMany({
      where: { installmentPlanId: plans[0]!.id },
    });
    expect(purchases).toHaveLength(1);

    // The pool consumed the full principal exactly once, not 1.080.000 × 2.
    const account = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}`)
      .set("Cookie", cookies);
    expect(account.body.creditUsed).toBe("1080000.0000");
  });

  it("two genuinely different plans (different keys) both commit their own pool usage", async () => {
    const body = (title: string) => ({
      title,
      totalPrincipal: "100000",
      installmentCount: 2,
      startDate: new Date().toISOString(),
      currency: "CLP",
      frequency: "MONTHLY",
      frequencyInterval: 1,
      cardId,
    });

    const before = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}`)
      .set("Cookie", cookies);
    const usedBefore = Number(before.body.creditUsed);

    const a = await request(app.getHttpServer())
      .post("/api/v1/installments")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send(body("Bicicleta"));
    const b = await request(app.getHttpServer())
      .post("/api/v1/installments")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send(body("Bicicleta")); // same data on purpose — different attempts

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}`)
      .set("Cookie", cookies);
    expect(Number(after.body.creditUsed)).toBe(usedBefore + 200000);
  });
});

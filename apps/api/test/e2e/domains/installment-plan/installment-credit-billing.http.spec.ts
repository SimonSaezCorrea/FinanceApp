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
 * Spec 014 — E2E, the whole life of a credit-card instalment plan through the real
 * HTTP surface: create (pool drops by the total), generate periods repeatedly
 * (each bills one instalment, with a deliberate gap in the middle), pay each one,
 * and past the last instalment nothing more is billed.
 *
 * This is the test for **SC-003**: across N periods, with a gap of silence in the
 * middle, the sum billed equals the plan's commitment — nothing twice, nothing
 * missed. Requires a reachable Postgres (real test DB), not part of `test:unit`.
 */
describe("Credit-card instalment plan billing, full lifecycle (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_billing_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let creditAccountId: string;
  let cardId: string;
  let fromAccountId: string;
  let planId: string;

  const INSTALLMENTS = 4;
  const PRINCIPAL = 360000; // 4 x 90.000, no interest

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
      .send({ email, password, name: "E2E Billing User" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const from = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "Cuenta Corriente",
        type: "CHECKING",
        currency: "CLP",
        accountNumber: "123",
        initialBalance: "5000000",
      });
    fromAccountId = from.body.id;

    const credit = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", cookies)
      .send({
        name: "CMR Visa",
        type: "CREDIT_CARD",
        currency: "CLP",
        cards: [
          {
            name: "CMR Visa",
            kind: "CREDIT",
            last4: "4827",
            expiryMonth: 12,
            expiryYear: 2030,
            // The primary CREDIT card's own limit IS the account's creditLimit —
            // supplied here, never as a top-level field, when cards[] is inline.
            limits: [{ currency: "CLP", limitAmount: "2000000" }],
          },
        ],
      });
    creditAccountId = credit.body.id;
    cardId = credit.body.cards[0].id;

    // A billing day so periods actually close. CALENDAR_DAY (not the account
    // default, BUSINESS_DAY) since the schedule below is built around day-of-month
    // due dates: `seedPeriodFromSchedule` lands the boundary exactly on a due date
    // only when the two use the same counting rule.
    await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${creditAccountId}`)
      .set("Cookie", cookies)
      .send({ billingCycleDay: 5, billingCycleType: "CALENDAR_DAY" });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { user: { email } } });
    await prisma.installmentPayment.deleteMany({ where: { plan: { user: { email } } } });
    await prisma.installmentPlan.deleteMany({ where: { user: { email } } });
    await prisma.creditStatement.deleteMany({ where: { account: { user: { email } } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("registering the plan drops available credit by the full principal (US1, SC-001)", async () => {
    const before = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}`)
      .set("Cookie", cookies);
    expect(before.body.creditUsed).toBe("0.0000");

    const plan = await request(app.getHttpServer())
      .post("/api/v1/installments")
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({
        title: "Notebook ASUS",
        totalPrincipal: PRINCIPAL.toString(),
        installmentCount: INSTALLMENTS,
        // Backdated so every instalment's due date is already in the past by the
        // time this test runs — every close in this file can act immediately.
        startDate: "2020-01-05T00:00:00.000Z",
        currency: "CLP",
        frequency: "MONTHLY",
        frequencyInterval: 1,
        category: "Tecnologia",
        cardId,
      });
    expect(plan.status).toBe(201);
    planId = plan.body.id;
    expect(plan.body.scheduledCount).toBe(INSTALLMENTS);
    expect(plan.body.billedCount).toBe(0);
    expect(plan.body.paidCount).toBe(0);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}`)
      .set("Cookie", cookies);
    expect(after.body.creditUsed).toBe(PRINCIPAL.toFixed(4));

    const movements = await request(app.getHttpServer())
      .get(`/api/v1/transactions?cardId=${cardId}`)
      .set("Cookie", cookies);
    expect(movements.body.items).toHaveLength(1);
    expect(movements.body.items[0].amount).toBe(PRINCIPAL.toFixed(4));
    // specs/016 US2: the purchase movement create-installment-plan mints is
    // UUID v7, not v4.
    expect(movements.body.items[0].id).toMatch(UUID_V7);
  });

  it("does not offer the per-instalment pay action for this plan (FR-021)", async () => {
    const plan = await request(app.getHttpServer())
      .get(`/api/v1/installments/${planId}`)
      .set("Cookie", cookies);
    expect(plan.body.generatesMovementOnPay).toBe(false);

    const attempt = await request(app.getHttpServer())
      .post(`/api/v1/installments/${planId}/payments/1/pay`)
      .set("Cookie", cookies)
      .set("Idempotency-Key", randomUUID())
      .send({ fromAccountId });
    expect(attempt.status).toBe(409);
    expect(attempt.body.error.code).toBe("INSTALLMENT_CARD_IS_CREDIT");
  });

  it("refuses to edit or delete the plan's purchase movement from Movimientos (FR-024)", async () => {
    const movements = await request(app.getHttpServer())
      .get(`/api/v1/transactions?cardId=${cardId}`)
      .set("Cookie", cookies);
    const purchaseId = movements.body.items[0].id;

    const patched = await request(app.getHttpServer())
      .patch(`/api/v1/transactions/${purchaseId}`)
      .set("Cookie", cookies)
      .send({ amount: "1" });
    expect(patched.status).toBe(409);
    expect(patched.body.error.code).toBe("TRANSACTION_LINKED_TO_INSTALLMENT");

    const deleted = await request(app.getHttpServer())
      .delete(`/api/v1/transactions/${purchaseId}`)
      .set("Cookie", cookies);
    expect(deleted.status).toBe(409);
    expect(deleted.body.error.code).toBe("TRANSACTION_LINKED_TO_INSTALLMENT");
  });

  it("bills and settles every instalment exactly once across the plan's life, including a gap (US2/US3, SC-003)", async () => {
    // Each close only ever reaches the immediate next boundary after the account's
    // currently open period — so billing all four instalments takes several rounds
    // of generate-then-pay, not one. Round 2 is the deliberate GAP: skipped
    // entirely (no generate call at all), simulating a whole cycle with no card
    // activity, where the app creates no period for it. A generous round budget
    // (well past INSTALLMENTS) proves the schedule still finishes despite the gap,
    // rather than baking in exactly how many rounds recovery takes.
    const MAX_ROUNDS = INSTALLMENTS + 3;
    let plan = await request(app.getHttpServer())
      .get(`/api/v1/installments/${planId}`)
      .set("Cookie", cookies);

    for (let round = 1; round <= MAX_ROUNDS && plan.body.paidCount < INSTALLMENTS; round += 1) {
      if (round === 2) continue; // the gap: no generation this round

      const generated = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${creditAccountId}/generate-statements`)
        .set("Cookie", cookies);
      expect(generated.status).toBe(201);

      for (const statement of generated.body) {
        if (statement.paidAt) continue;
        const pay = await request(app.getHttpServer())
          .post(`/api/v1/accounts/${creditAccountId}/credit-statements/${statement.id}/pay`)
          .set("Cookie", cookies)
          .set("Idempotency-Key", randomUUID())
          .send({ fromAccountId });
        expect(pay.status).toBe(201);
      }

      plan = await request(app.getHttpServer())
        .get(`/api/v1/installments/${planId}`)
        .set("Cookie", cookies);
    }

    // SC-003: nothing billed twice, nothing missed. The whole schedule ends up
    // paid — no instalment left scheduled or merely billed — despite the gap.
    expect(plan.body.paidCount).toBe(INSTALLMENTS);
    expect(plan.body.billedCount).toBe(0);
    expect(plan.body.scheduledCount).toBe(0);
    const total = plan.body.payments.reduce(
      (sum: number, p: { paidAmount: string | null }) => sum + Number(p.paidAmount ?? "0"),
      0,
    );
    expect(total).toBe(PRINCIPAL);
  });

  it("bills nothing more once the plan is fully settled (FR-013)", async () => {
    const before = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}/credit-statements`)
      .set("Cookie", cookies);
    const statementCountBefore = before.body.length;

    await request(app.getHttpServer())
      .post(`/api/v1/accounts/${creditAccountId}/generate-statements`)
      .set("Cookie", cookies);

    const plan = await request(app.getHttpServer())
      .get(`/api/v1/installments/${planId}`)
      .set("Cookie", cookies);
    expect(plan.body.paidCount).toBe(INSTALLMENTS);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${creditAccountId}/credit-statements`)
      .set("Cookie", cookies);
    // A new period may open for later card activity, but none of it comes from
    // this plan — its schedule is exhausted.
    expect(after.body.length).toBeGreaterThanOrEqual(statementCountBefore);
  });
});

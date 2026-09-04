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
 * E2E test (mirrors debts'/installments' pattern): full create/list/get/
 * update/delete HTTP flows through the migrated Facade controller — must
 * behave identically to the pre-migration `RecurringController`/
 * `RecurringService`. Requires a reachable Postgres (real test DB), not part
 * of `test:unit`.
 */
describe("Recurring HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_recurring_${randomUUID()}@test.local`;
  const otherEmail = `e2e_recurring_other_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let recurringId: string;
  let foreignAccountId: string;

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
      .send({ email, password, name: "E2E Recurring User" });
    cookies = registerRes.get("Set-Cookie") ?? [];

    const registerOther = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: otherEmail, password, name: "Other" });
    const otherCookies = registerOther.get("Set-Cookie") ?? [];
    const otherAccount = await request(app.getHttpServer())
      .post("/api/v1/accounts")
      .set("Cookie", otherCookies)
      .send({ name: "Other's account", type: "CHECKING", currency: "CLP", accountNumber: "999" });
    foreignAccountId = otherAccount.body.id;
  });

  afterAll(async () => {
    await prisma.recurringExpense.deleteMany({ where: { user: { email } } });
    await prisma.bankAccount.deleteMany({ where: { user: { email: otherEmail } } });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await app.close();
  });

  // Principle II: a body-supplied FK must be ownership-verified before persisting.
  it("rejects creating a recurring expense with another user's bankAccountId", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/recurring")
      .set("Cookie", cookies)
      .send({
        label: "Foreign-linked",
        amount: "1000",
        currency: "CLP",
        frequency: "MONTHLY",
        interval: 1,
        anchorDate: "2026-01-05T00:00:00.000Z",
        bankAccountId: foreignAccountId,
      });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });

  it("creates a recurring expense", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/recurring")
      .set("Cookie", cookies)
      .send({
        label: "Arriendo",
        amount: "520000",
        currency: "CLP",
        category: "Vivienda",
        frequency: "MONTHLY",
        interval: 1,
        anchorDate: "2026-01-05T00:00:00.000Z",
      });
    expect(res.status).toBe(201);
    recurringId = res.body.id;
    expect(res.body.active).toBe(true);
    expect(typeof res.body.nextDueAt).toBe("string");
  });

  it("lists the user's recurring expenses", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/recurring").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.map((r: { id: string }) => r.id)).toContain(recurringId);
  });

  it("returns RECURRING_NOT_FOUND for an unknown id", async () => {
    const res = await request(app.getHttpServer())
      // specs/016: a malformed id ("ghost") is now rejected earlier with
      // INVALID_ID_FORMAT — this well-formed UUID v7 exercises NOT_FOUND.
      .get("/api/v1/recurring/018f6b9a-2c3e-7c21-9e4a-1f2b3c4d5e6f")
      .set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RECURRING_NOT_FOUND");
  });

  it("updates the recurring expense's scalar fields", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/recurring/${recurringId}`)
      .set("Cookie", cookies)
      .send({ active: false, label: "Arriendo depto" });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(res.body.label).toBe("Arriendo depto");
  });

  it("rejects patching a recurring expense onto another user's bankAccountId", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/recurring/${recurringId}`)
      .set("Cookie", cookies)
      .send({ bankAccountId: foreignAccountId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });

  it("deletes the recurring expense", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/recurring/${recurringId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);
  });

  it("returns RECURRING_NOT_FOUND for a deleted/unknown id", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/recurring/${recurringId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RECURRING_NOT_FOUND");
  });
});

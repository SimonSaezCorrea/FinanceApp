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
 * E2E test (mirrors transactions'/accounts' T037/T046): full create/pay/unpay/
 * update/delete HTTP flows through the migrated Facade controller — must
 * behave identically to the pre-migration `InstallmentsController`/
 * `InstallmentsService`. Requires a reachable Postgres (real test DB), not
 * part of `test:unit`.
 */
describe("Installments HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_inst_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let planId: string;

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
      .send({ email, password, name: "E2E Installments User" });
    cookies = registerRes.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.installmentPlan.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("creates a plan with an equal-principal schedule", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/installments")
      .set("Cookie", cookies)
      .send({
        title: "Laptop",
        totalPrincipal: "1200",
        installmentCount: 3,
        startDate: "2026-01-15T00:00:00.000Z",
        currency: "USD",
        frequency: "MONTHLY",
        frequencyInterval: 1,
      });
    expect(res.status).toBe(201);
    planId = res.body.id;
    expect(res.body.payments).toHaveLength(3);
    expect(res.body.payments.map((p: { amount: string }) => p.amount)).toEqual(["400.0000", "400.0000", "400.0000"]);
  });

  it("returns INSTALLMENT_PAYMENT_NOT_FOUND for an unknown sequence", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/installments/${planId}/payments/99/pay`)
      .set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("INSTALLMENT_PAYMENT_NOT_FOUND");
  });

  it("pays the first installment", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/installments/${planId}/payments/1/pay`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer()).get(`/api/v1/installments/${planId}`).set("Cookie", cookies);
    expect(getRes.body.payments[0].paidAt).not.toBeNull();
  });

  it("unpays the first installment", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/installments/${planId}/payments/1/unpay`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);

    const getRes = await request(app.getHttpServer()).get(`/api/v1/installments/${planId}`).set("Cookie", cookies);
    expect(getRes.body.payments[0].paidAt).toBeNull();
  });

  it("updates the plan's scalar fields", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/installments/${planId}`)
      .set("Cookie", cookies)
      .send({ title: "Renamed laptop" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Renamed laptop");
  });

  it("deletes the plan", async () => {
    const res = await request(app.getHttpServer()).delete(`/api/v1/installments/${planId}`).set("Cookie", cookies);
    expect(res.status).toBe(204);
  });

  it("returns INSTALLMENT_PLAN_NOT_FOUND for a deleted/unknown id", async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/installments/${planId}`).set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("INSTALLMENT_PLAN_NOT_FOUND");
  });
});

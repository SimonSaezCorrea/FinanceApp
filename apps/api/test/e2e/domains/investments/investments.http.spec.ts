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
 * E2E test (mirrors debts'/savings' equivalents): full create/get/update/
 * delete HTTP flows through the migrated Facade controller — must behave
 * identically to the pre-migration `InvestmentsController`/`InvestmentsService`.
 * Requires a reachable Postgres (real test DB), not part of `test:unit`.
 */
describe("Investments HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_investments_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let investmentId: string;

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
      .send({ email, password, name: "E2E Investments User" });
    cookies = registerRes.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.investment.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("creates an ETF investment", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/investments")
      .set("Cookie", cookies)
      .send({
        kind: "ETF",
        label: "Vanguard S&P 500",
        currency: "USD",
        symbol: "VOO",
        shares: "12.34567890",
      });
    expect(res.status).toBe(201);
    investmentId = res.body.id;
    expect(res.body.shares).toBe("12.34567890");
  });

  it("lists the user's investments", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/investments").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("returns INVESTMENT_NOT_FOUND for an unknown id", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/investments/ghost").set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("INVESTMENT_NOT_FOUND");
  });

  it("updates the investment's scalar fields", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/investments/${investmentId}`)
      .set("Cookie", cookies)
      .send({ label: "Vanguard S&P 500 (renamed)" });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe("Vanguard S&P 500 (renamed)");
  });

  it("deletes the investment", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/investments/${investmentId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);
  });

  it("returns INVESTMENT_NOT_FOUND for a deleted/unknown id", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/investments/${investmentId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("INVESTMENT_NOT_FOUND");
  });
});

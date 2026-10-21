import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

/**
 * E2E (spec 033): `GET /public/exchange-rates` — the public site reads the same rows as the app
 * WITHOUT a session. Rows live in 2096 so they never mix with real history (spec 030's suite uses
 * 2097). Requires a reachable Postgres.
 */
describe("Public exchange rates HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const clean = () =>
    prisma.exchangeRate.deleteMany({
      where: { date: { gte: new Date("2096-01-01"), lt: new Date("2097-01-01") } },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    await clean();
    await prisma.exchangeRate.createMany({
      data: [
        {
          currency: "CLF",
          date: new Date("2096-05-01"),
          value: "45000",
          valueDate: new Date("2096-05-01"),
        },
        {
          currency: "CLF",
          date: new Date("2096-05-02"),
          value: "45000",
          valueDate: new Date("2096-05-01"),
        },
      ],
    });
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  it("answers without a session, cacheable, with no cookie set", async () => {
    const res = await request(app.getHttpServer()).get(
      "/api/v1/public/exchange-rates?currency=CLF&from=2096-05-01&to=2096-05-02",
    );

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.body.items.map((r: { date: string }) => r.date)).toEqual([
      "2096-05-02",
      "2096-05-01",
    ]);
    expect(res.body.items[0].valueDate).toBe("2096-05-01");
    expect(res.body).toHaveProperty("latest.USD");
    expect(res.body).toHaveProperty("latest.CLF");
    expect(res.body).toHaveProperty("first.USD");
    expect(res.body).toHaveProperty("first.CLF");
  });

  it("keeps the app's route behind the session", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/exchange-rates");
    expect(res.status).toBe(401);
  });

  it("applies the same range limit", async () => {
    const res = await request(app.getHttpServer()).get(
      "/api/v1/public/exchange-rates?from=2095-01-01&to=2096-05-02",
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("EXCHANGE_RANGE_TOO_LARGE");
  });

  it("rejects a malformed day", async () => {
    const res = await request(app.getHttpServer()).get(
      "/api/v1/public/exchange-rates?to=yesterday",
    );
    expect(res.status).toBe(400);
  });
});

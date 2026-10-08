import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { randomValidRut } from "../../support/rut";

/**
 * E2E (spec 030): `GET /exchange-rates` — authed, validated, read-only. Rows live in the year
 * 2097 so they never mix with the dev database's real history. Requires a reachable, seeded
 * Postgres. The recorder itself never runs here (the boot-time run is skipped under test).
 */
describe("Exchange rates HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_rates_${randomUUID()}@test.local`;
  let cookies: string[] = [];

  const clean = () =>
    prisma.exchangeRate.deleteMany({
      where: { date: { gte: new Date("2097-01-01"), lt: new Date("2098-01-01") } },
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
      .send({
        email,
        password: "Sup3rSecret!",
        name: "E2E Rates User",
        sensitiveDataConsent: true,
        birthDate: "1990-01-01",
        identifierValue: randomValidRut(),
      });
    cookies = registerRes.get("Set-Cookie") ?? [];

    await clean();
    await prisma.exchangeRate.createMany({
      data: [
        { currency: "USD", date: new Date("2097-03-01"), value: "950", valueDate: new Date("2097-03-01") },
        { currency: "USD", date: new Date("2097-03-02"), value: "950", valueDate: new Date("2097-03-01") },
        { currency: "CLF", date: new Date("2097-03-02"), value: "41000", valueDate: new Date("2097-03-02") },
      ],
    });
  });

  afterAll(async () => {
    await clean();
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const get = (qs = "") =>
    request(app.getHttpServer()).get(`/api/v1/exchange-rates${qs}`).set("Cookie", cookies);

  it("requires a session", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/exchange-rates");
    expect(res.status).toBe(401);
  });

  it("answers the rows of a range, newest first, with their value date", async () => {
    const res = await get("?from=2097-03-01&to=2097-03-02");

    expect(res.status).toBe(200);
    expect(res.body.items.map((r: { currency: string; date: string }) => `${r.currency}|${r.date}`)).toEqual([
      "CLF|2097-03-02",
      "USD|2097-03-02",
      "USD|2097-03-01",
    ]);
    const carried = res.body.items.find(
      (r: { currency: string; date: string }) => r.currency === "USD" && r.date === "2097-03-02",
    );
    expect(carried).toEqual({
      currency: "USD",
      date: "2097-03-02",
      value: "950.0000",
      valueDate: "2097-03-01",
    });
  });

  it("filters by currency", async () => {
    const res = await get("?currency=CLF&from=2097-03-01&to=2097-03-02");

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].currency).toBe("CLF");
  });

  it("always answers `latest` for both currencies", async () => {
    const res = await get("?from=2097-03-01&to=2097-03-01");

    expect(res.status).toBe(200);
    expect(res.body.latest).toHaveProperty("USD");
    expect(res.body.latest).toHaveProperty("CLF");
  });

  it("rejects a malformed query with 400", async () => {
    expect((await get("?from=yesterday")).status).toBe(400);
    expect((await get("?currency=EUR")).status).toBe(400);
  });

  it("rejects an inverted range with INVALID_DATE_RANGE", async () => {
    const res = await get("?from=2097-03-05&to=2097-03-01");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_DATE_RANGE");
  });

  it("rejects a range over 400 days with EXCHANGE_RANGE_TOO_LARGE", async () => {
    const res = await get("?from=2096-01-01&to=2097-03-01");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("EXCHANGE_RANGE_TOO_LARGE");
  });

  it("has no write route: the table is filled by the recorder only", async () => {
    for (const method of ["post", "patch", "put", "delete"] as const) {
      const res = await request(app.getHttpServer())
        [method]("/api/v1/exchange-rates")
        .set("Cookie", cookies)
        .send({});
      expect(res.status).toBe(404);
    }
  });
});

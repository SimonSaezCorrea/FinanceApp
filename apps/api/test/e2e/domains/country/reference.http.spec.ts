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
 * E2E test (mirrors wallet's/import's pattern): full countries/institutions/
 * currencies HTTP flows through the migrated Facade controller — must behave
 * identically to the pre-migration `ReferenceController`/`ReferenceService`.
 * Requires a reachable Postgres (real test DB), already seeded via
 * `pnpm db:seed`. Not part of `test:unit`.
 */
describe("Reference HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_reference_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let cookies: string[] = [];

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
      .send({ email, password, name: "E2E Reference User" });
    cookies = registerRes.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("requires auth", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/countries");
    expect(res.status).toBe(401);
  });

  it("lists countries", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/countries").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const chile = res.body.find((c: { alpha2: string }) => c.alpha2 === "CL");
    expect(chile).toBeDefined();
    expect(chile.identifierTypes[0]).toBe("RUT");
  });

  it("lists institutions, filterable by country and kind", async () => {
    const all = await request(app.getHttpServer())
      .get("/api/v1/institutions")
      .set("Cookie", cookies);
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThan(0);

    const banksInCl = await request(app.getHttpServer())
      .get("/api/v1/institutions?country=CL&kind=BANK")
      .set("Cookie", cookies);
    expect(banksInCl.status).toBe(200);
    expect(banksInCl.body.length).toBeGreaterThan(0);
    expect(banksInCl.body.every((i: { kind: string }) => i.kind === "BANK")).toBe(true);
  });

  it("lists currencies", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/currencies").set("Cookie", cookies);
    expect(res.status).toBe(200);
    expect(res.body.some((c: { code: string }) => c.code === "CLP")).toBe(true);
  });
});

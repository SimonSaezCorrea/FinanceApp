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

/** E2E (spec 031): the public site sends the language of the page an account was created from,
 * and the app opens in it; without one the account starts in Spanish, as before. */
describe("Register locale HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prefix = `e2e_register_locale_${randomUUID()}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await app.close();
  });

  const register = (tag: string, extra: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: `${prefix}_${tag}@test.local`,
        password: "Sup3rSecret!",
        name: "Register Locale E2E",
        sensitiveDataConsent: true,
        birthDate: "1990-01-01",
        identifierValue: randomValidRut(),
        ...extra,
      });

  it("stores the language sent with the registration", async () => {
    const res = await register("en", { locale: "en" });
    expect(res.status).toBe(201);
    expect(res.body.locale).toBe("en");
  });

  it("starts in Spanish when no language is sent", async () => {
    const res = await register("default");
    expect(res.status).toBe(201);
    expect(res.body.locale).toBe("es");
  });

  it("rejects a language the app doesn't have", async () => {
    const res = await register("fr", { locale: "fr" });
    expect(res.status).toBe(400);
  });
});

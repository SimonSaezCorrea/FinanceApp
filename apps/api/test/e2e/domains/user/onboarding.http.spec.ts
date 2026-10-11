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

/** E2E (2026-10-11): closing the first-steps guide is kept on the account, so a second login —
 * another device — already sees it closed, and closing it again changes nothing. */
describe("Onboarding guide HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_onboarding_${randomUUID()}@test.local`;
  const rut = randomValidRut();
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
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "Onboarding E2E",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });
    cookies = res.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("starts open, closes for good, and the closing date never moves", async () => {
    const before = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(before.body.onboardingClosed).toBe(false);

    const close = await request(app.getHttpServer())
      .post("/api/v1/auth/me/onboarding/close")
      .set("Cookie", cookies);
    expect(close.status).toBe(204);
    const first = (await prisma.user.findFirst({ where: { email } }))?.onboardingClosedAt;
    expect(first).toBeInstanceOf(Date);

    const again = await request(app.getHttpServer())
      .post("/api/v1/auth/me/onboarding/close")
      .set("Cookie", cookies);
    expect(again.status).toBe(204);
    expect((await prisma.user.findFirst({ where: { email } }))?.onboardingClosedAt).toEqual(first);

    // Another device: a fresh login already sees it closed.
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    const other = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", login.get("Set-Cookie") ?? []);
    expect(other.body.onboardingClosed).toBe(true);
  });

  it("needs a session", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/me/onboarding/close");
    expect(res.status).toBe(401);
  });
});

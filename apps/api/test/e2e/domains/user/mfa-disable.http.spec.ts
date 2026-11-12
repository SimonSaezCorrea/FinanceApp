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
import { stepUp, forgetStepUp, totpCodeFor } from "../../support/mfa";

/** E2E test (US3, specs/021): re-entering the password disables MFA and invalidates everything. */
describe("MFA disable HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_mfadisable_${randomUUID()}@test.local`;
  const rut = randomValidRut();
  const password = "Sup3rSecret!";
  let cookies: string[] = [];
  let secret = "";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const registered = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "MFA Disable",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });
    cookies = registered.get("Set-Cookie") ?? [];
    await stepUp(app, cookies);
    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", cookies);
    await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", cookies)
      .send({ code: await totpCodeFor(enroll.body.secret) });
    secret = enroll.body.secret;
    await forgetStepUp(prisma, email);
  });

  afterAll(async () => {
    await prisma.mfaRecoveryCode.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("asks for a step-up first: the password alone does not disable MFA", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/disable")
      .set("Cookie", cookies)
      .send({ password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("STEP_UP_REQUIRED");

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.body.mfaEnabled).toBe(true);
  });

  it("rejects disabling with the wrong password, MFA stays active", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/disable")
      .set("Cookie", cookies)
      .send({ password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CURRENT_PASSWORD");

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.body.mfaEnabled).toBe(true);
  });

  it("disables MFA with the correct password: revokes every other session, keeps this one, and a subsequent login needs no second step", async () => {
    // A second, unrelated login (specs/024) — must be locked out immediately once MFA
    // is disabled from `cookies`, while `cookies` itself keeps working.
    // MFA is on since beforeAll (TOTP, `secret`).
    const secondLoginStart = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    expect(secondLoginStart.body.mfaRequired).toBe(true);
    const secondLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login/mfa-verify")
      .set("Cookie", secondLoginStart.get("Set-Cookie") ?? [])
      .send({ code: await totpCodeFor(secret) });
    const cookiesOther = secondLogin.get("Set-Cookie") ?? [];
    const stepUp = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", cookies)
      .send({ method: "totp", code: await totpCodeFor(secret) });
    expect(stepUp.status).toBe(200);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/disable")
      .set("Cookie", cookies)
      .send({ password });
    expect(res.status).toBe(204);

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.body.mfaEnabled).toBe(false);
    expect(me.body.mfaRecoveryCodesRemaining).toBe(0);

    const meOther = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", cookiesOther);
    expect(meOther.status).toBe(401);

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    expect(login.body).toEqual({ mfaRequired: false, user: login.body.user });
    expect(login.body.user.email).toBe(email.toLowerCase());
  });

  it("reactivating generates a completely new secret and recovery codes", async () => {
    await stepUp(app, cookies);
    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", cookies);
    const confirm = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", cookies)
      .send({ code: await totpCodeFor(enroll.body.secret) });
    expect(confirm.status).toBe(201);
    expect(confirm.body.recoveryCodes).toHaveLength(10);

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.body.mfaEnabled).toBe(true);
    expect(me.body.mfaRecoveryCodesRemaining).toBe(10);
  });
});

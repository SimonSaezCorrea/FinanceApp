import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import * as OTPAuth from "otpauth";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

function totpCodeFor(secret: string): string {
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();
}

/** E2E test (US3, specs/021): re-entering the password disables MFA and invalidates everything. */
describe("MFA disable HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_mfadisable_${randomUUID()}@test.local`;
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

    const registered = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "MFA Disable" });
    cookies = registered.get("Set-Cookie") ?? [];
    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", cookies);
    await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", cookies)
      .send({ code: totpCodeFor(enroll.body.secret) });
  });

  afterAll(async () => {
    await prisma.mfaRecoveryCode.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
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

  it("disables MFA with the correct password, and a subsequent login needs no second step", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/disable")
      .set("Cookie", cookies)
      .send({ password });
    expect(res.status).toBe(204);

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.body.mfaEnabled).toBe(false);
    expect(me.body.mfaRecoveryCodesRemaining).toBe(0);

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    expect(login.body).toEqual({ mfaRequired: false, user: login.body.user });
    expect(login.body.user.email).toBe(email.toLowerCase());
  });

  it("reactivating generates a completely new secret and recovery codes", async () => {
    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", cookies);
    const confirm = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", cookies)
      .send({ code: totpCodeFor(enroll.body.secret) });
    expect(confirm.status).toBe(201);
    expect(confirm.body.recoveryCodes).toHaveLength(10);

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.body.mfaEnabled).toBe(true);
    expect(me.body.mfaRecoveryCodesRemaining).toBe(10);
  });
});

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

/** E2E test (US4, specs/021): logging in with a recovery code instead of the app's TOTP. */
describe("MFA recovery-code login HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_mfarecovery_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let recoveryCode: string;

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
      .send({ email, password, name: "MFA Recovery", sensitiveDataConsent: true });
    const cookies = registered.get("Set-Cookie") ?? [];
    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", cookies);
    const confirm = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", cookies)
      .send({ code: totpCodeFor(enroll.body.secret) });
    recoveryCode = confirm.body.recoveryCodes[0];
  });

  afterAll(async () => {
    await prisma.mfaRecoveryCode.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("completes login with an unused recovery code", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const pendingCookies = login.get("Set-Cookie") ?? [];

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login/mfa-verify")
      .set("Cookie", pendingCookies)
      .send({ code: recoveryCode });
    expect(res.status).toBe(200);
    expect((res.get("Set-Cookie") ?? []).some((c) => c.startsWith("access_token="))).toBe(true);

    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", res.get("Set-Cookie") ?? []);
    expect(me.body.mfaRecoveryCodesRemaining).toBe(9);
  });

  it("rejects reusing the same recovery code a second time", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const pendingCookies = login.get("Set-Cookie") ?? [];

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login/mfa-verify")
      .set("Cookie", pendingCookies)
      .send({ code: recoveryCode });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_MFA_CODE");
  });
});

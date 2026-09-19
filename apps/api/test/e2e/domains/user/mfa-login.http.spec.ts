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

/** E2E test (US2, specs/021): login's second factor, end to end through the real HTTP Facade. */
describe("MFA login HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_mfalogin_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  let secret: string;

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
      .send({ email, password, name: "MFA Login" });
    const regCookies = registered.get("Set-Cookie") ?? [];

    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", regCookies);
    secret = enroll.body.secret;
    await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", regCookies)
      .send({ code: totpCodeFor(secret) });
  });

  afterAll(async () => {
    await prisma.mfaRecoveryCode.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("login with correct password only returns mfaRequired, no session cookies", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mfaRequired: true });
    const cookies = res.get("Set-Cookie") ?? [];
    expect(cookies.some((c) => c.startsWith("mfa_pending_token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(false);
  });

  it("mfa-verify with an incorrect code rejects and grants no session", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const pendingCookies = login.get("Set-Cookie") ?? [];

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login/mfa-verify")
      .set("Cookie", pendingCookies)
      .send({ code: "000000" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_MFA_CODE");
    expect((res.get("Set-Cookie") ?? []).some((c) => c.startsWith("access_token="))).toBe(false);
  });

  it("mfa-verify with the correct code completes the login", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const pendingCookies = login.get("Set-Cookie") ?? [];

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login/mfa-verify")
      .set("Cookie", pendingCookies)
      .send({ code: totpCodeFor(secret) });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email.toLowerCase());
    const cookies = res.get("Set-Cookie") ?? [];
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
  });

  it("5 consecutive invalid codes lock the account, even the correct code afterward", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const pendingCookies = login.get("Set-Cookie") ?? [];

    let last;
    for (let i = 0; i < 5; i++) {
      last = await request(app.getHttpServer())
        .post("/api/v1/auth/login/mfa-verify")
        .set("Cookie", pendingCookies)
        .send({ code: "000000" });
    }
    expect(last!.status).toBe(429);
    expect(last!.body.error.code).toBe("MFA_LOCKED");

    const withCorrectCode = await request(app.getHttpServer())
      .post("/api/v1/auth/login/mfa-verify")
      .set("Cookie", pendingCookies)
      .send({ code: totpCodeFor(secret) });
    expect(withCorrectCode.status).toBe(429);
  });
});

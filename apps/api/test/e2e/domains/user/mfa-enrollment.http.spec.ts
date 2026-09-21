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

/** E2E test (US1, specs/021): activation end to end through the real HTTP Facade. */
describe("MFA enrollment HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_mfaenroll_${randomUUID()}@test.local`;
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

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password, name: "MFA Enroll", sensitiveDataConsent: true });
    cookies = res.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.mfaRecoveryCode.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("GET /auth/me starts with mfaEnabled: false", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(res.body.mfaEnabled).toBe(false);
    expect(res.body.mfaRecoveryCodesRemaining).toBe(0);
  });

  it("rejects confirm with an invalid code, leaving MFA inactive", async () => {
    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", cookies);
    expect(enroll.status).toBe(201);
    expect(enroll.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const bad = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", cookies)
      .send({ code: "000000" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("INVALID_MFA_CODE");

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.body.mfaEnabled).toBe(false);
  });

  it("activates MFA on a valid code and returns 10 recovery codes exactly once", async () => {
    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", cookies);
    const code = totpCodeFor(enroll.body.secret);

    const confirm = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", cookies)
      .send({ code });
    expect(confirm.status).toBe(201);
    expect(confirm.body.recoveryCodes).toHaveLength(10);

    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.body.mfaEnabled).toBe(true);
    expect(me.body.mfaRecoveryCodesRemaining).toBe(10);
    // Never exposed again, in any shape, after activation (FR-006/FR-016 regression).
    expect(JSON.stringify(me.body)).not.toContain(confirm.body.recoveryCodes[0]);
    expect(me.body.secret).toBeUndefined();
    expect(me.body.mfaSecret).toBeUndefined();
    expect(me.body.recoveryCodes).toBeUndefined();
  });

  it("rejects a second enroll/confirm while MFA is already active", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", cookies);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("MFA_ALREADY_ENABLED");
  });
});

import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import * as OTPAuth from "otpauth";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return {
    ...actual,
    verifyRegistrationResponse: vi.fn(),
    verifyAuthenticationResponse: vi.fn(),
  };
});

import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { randomValidRut } from "../../support/rut";

function totpCodeFor(secret: string): string {
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();
}

/** `mfaSecret` completes the pending login's second factor when the account has TOTP enabled. */
async function loginAndListSessionId(
  app: INestApplication,
  rut: string,
  password: string,
  mfaSecret?: string,
): Promise<{ cookies: string[]; sessionId: string }> {
  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ identifierValue: rut, password });
  let cookies = login.get("Set-Cookie") ?? [];
  if (login.body.mfaRequired) {
    const verify = await request(app.getHttpServer())
      .post("/api/v1/auth/login/mfa-verify")
      .set("Cookie", cookies)
      .send({ code: totpCodeFor(mfaSecret ?? "") });
    cookies = verify.get("Set-Cookie") ?? [];
  }
  const list = await request(app.getHttpServer())
    .get("/api/v1/auth/sessions")
    .set("Cookie", cookies);
  const current = list.body.find((s: { isCurrent: boolean }) => s.isCurrent);
  return { cookies, sessionId: current.id };
}

/**
 * E2E (2026-09-25): closing a DIFFERENT session or "cerrar todas las demás" both require the
 * caller's own session to have stepped up (TOTP, password, or passkey) within the last 5
 * minutes — otherwise 403 STEP_UP_REQUIRED, never a silent success.
 */
describe("Step-up before closing sessions HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const password = "Sup3rSecret!";

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
    await app.close();
  });

  it("without a step-up, closing a different session answers 403 STEP_UP_REQUIRED", async () => {
    const email = `e2e_stepup_none_${randomUUID()}@test.local`;
    const rut = randomValidRut();
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "No Step-up",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });

    const a = await loginAndListSessionId(app, rut, password);
    const b = await loginAndListSessionId(app, rut, password);

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${b.sessionId}`)
      .set("Cookie", a.cookies);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("STEP_UP_REQUIRED");

    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  });

  it("closing the caller's OWN session never needs a step-up (it's just signing out)", async () => {
    const email = `e2e_stepup_own_${randomUUID()}@test.local`;
    const rut = randomValidRut();
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "Own Session",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });

    const { cookies, sessionId } = await loginAndListSessionId(app, rut, password);

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${sessionId}`)
      .set("Cookie", cookies);
    expect(res.status).toBe(204);

    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  });

  it("a password step-up (no TOTP/passkey configured) lets the session close another one", async () => {
    const email = `e2e_stepup_pw_${randomUUID()}@test.local`;
    const rut = randomValidRut();
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "Password Step-up",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });

    const a = await loginAndListSessionId(app, rut, password);
    const b = await loginAndListSessionId(app, rut, password);

    const wrong = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", a.cookies)
      .send({ method: "password", password: "not-the-password" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("INVALID_CURRENT_PASSWORD");

    const stepUp = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", a.cookies)
      .send({ method: "password", password });
    expect(stepUp.status).toBe(200);
    expect(new Date(stepUp.body.verifiedUntil).getTime()).toBeGreaterThan(Date.now());

    const closeRes = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${b.sessionId}`)
      .set("Cookie", a.cookies);
    expect(closeRes.status).toBe(204);

    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  });

  it("with TOTP configured, the password alone is refused (STEP_UP_METHOD_NOT_ALLOWED) — a TOTP code works", async () => {
    const email = `e2e_stepup_totp_${randomUUID()}@test.local`;
    const rut = randomValidRut();
    const registered = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "TOTP Step-up",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });
    const regCookies = registered.get("Set-Cookie") ?? [];
    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", regCookies);
    await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", regCookies)
      .send({ code: totpCodeFor(enroll.body.secret) });

    const a = await loginAndListSessionId(app, rut, password, enroll.body.secret);
    const b = await loginAndListSessionId(app, rut, password, enroll.body.secret);

    const passwordAttempt = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", a.cookies)
      .send({ method: "password", password });
    expect(passwordAttempt.status).toBe(400);
    expect(passwordAttempt.body.error.code).toBe("STEP_UP_METHOD_NOT_ALLOWED");

    const wrongCode = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", a.cookies)
      .send({ method: "totp", code: "000000" });
    expect(wrongCode.status).toBe(401);
    expect(wrongCode.body.error.code).toBe("INVALID_MFA_CODE");

    const stepUp = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", a.cookies)
      .send({ method: "totp", code: totpCodeFor(enroll.body.secret) });
    expect(stepUp.status).toBe(200);

    const closeRes = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${b.sessionId}`)
      .set("Cookie", a.cookies);
    expect(closeRes.status).toBe(204);

    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.mfaRecoveryCode.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  });

  it("a passkey step-up (two-step ceremony) also lets the session close another one", async () => {
    const email = `e2e_stepup_passkey_${randomUUID()}@test.local`;
    const rut = randomValidRut();
    const credentialId = `cred_${randomUUID()}`;
    const registered = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "Passkey Step-up",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });
    const regCookies = registered.get("Set-Cookie") ?? [];

    const regOptions = await request(app.getHttpServer())
      .post("/api/v1/auth/me/passkeys/register-options")
      .set("Cookie", regCookies);
    const regChallengeCookies = regOptions.get("Set-Cookie") ?? [];
    vi.mocked(verifyRegistrationResponse).mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: { id: credentialId, publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
      },
    } as never);
    await request(app.getHttpServer())
      .post("/api/v1/auth/me/passkeys/register-verify")
      .set("Cookie", [...regCookies, ...regChallengeCookies])
      .send({ name: "E2E Key", response: {} });

    const a = await loginAndListSessionId(app, rut, password);
    const b = await loginAndListSessionId(app, rut, password);

    const options = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up/passkey-options")
      .set("Cookie", a.cookies);
    expect(options.status).toBe(200);
    const challengeCookies = options.get("Set-Cookie") ?? [];

    vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    } as never);
    const verify = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up/passkey-verify")
      .set("Cookie", [...a.cookies, ...challengeCookies])
      .send({ response: { id: credentialId } });
    expect(verify.status).toBe(200);
    expect(new Date(verify.body.verifiedUntil).getTime()).toBeGreaterThan(Date.now());

    const closeRes = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${b.sessionId}`)
      .set("Cookie", a.cookies);
    expect(closeRes.status).toBe(204);

    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.passkey.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  });

  it("a step-up on B's own session never unlocks A's ability to close others (bound to the session)", async () => {
    const email = `e2e_stepup_bound_${randomUUID()}@test.local`;
    const rut = randomValidRut();
    await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "Bound to session",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });

    const a = await loginAndListSessionId(app, rut, password);
    const b = await loginAndListSessionId(app, rut, password);

    // B steps up on ITS OWN session — A's own session is still un-stepped-up.
    await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", b.cookies)
      .send({ method: "password", password });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${b.sessionId}`)
      .set("Cookie", a.cookies);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("STEP_UP_REQUIRED");

    await prisma.session.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  });
});

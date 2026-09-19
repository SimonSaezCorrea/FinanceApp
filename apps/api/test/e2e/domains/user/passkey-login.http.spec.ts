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

function totpCodeFor(secret: string): string {
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();
}

describe("Passkey login HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_passkeylogin_${randomUUID()}@test.local`;
  const password = "Sup3rSecret!";
  const credentialId = `cred_${randomUUID()}`;

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
      .send({ email, password, name: "Passkey Login" });
    const cookies = registered.get("Set-Cookie") ?? [];

    const options = await request(app.getHttpServer())
      .post("/api/v1/auth/me/passkeys/register-options")
      .set("Cookie", cookies);
    const regCookies = options.get("Set-Cookie") ?? [];

    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: credentialId, publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
      },
    } as never);
    await request(app.getHttpServer())
      .post("/api/v1/auth/me/passkeys/register-verify")
      .set("Cookie", [...cookies, ...regCookies])
      .send({ name: "E2E Key", response: {} });
  });

  afterAll(async () => {
    await prisma.passkey.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("passkey-options always responds the same shape whether or not the email has passkeys", async () => {
    const known = await request(app.getHttpServer())
      .post("/api/v1/auth/login/passkey-options")
      .send({ email });
    const unknown = await request(app.getHttpServer())
      .post("/api/v1/auth/login/passkey-options")
      .send({ email: `nobody_${randomUUID()}@test.local` });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(Object.keys(known.body)).toEqual(Object.keys(unknown.body));
    expect(known.body.options.allowCredentials).toHaveLength(1);
    expect(unknown.body.options.allowCredentials).toEqual([]);
  });

  it("passkey-verify with an unknown email rejects generically (no enumeration)", async () => {
    const options = await request(app.getHttpServer())
      .post("/api/v1/auth/login/passkey-options")
      .send({ email: `nobody_${randomUUID()}@test.local` });
    const optCookies = options.get("Set-Cookie") ?? [];

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login/passkey-verify")
      .set("Cookie", optCookies)
      .send({ response: { id: "whatever" } });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("discoverable login (no email at all) resolves the account and completes the session", async () => {
    const options = await request(app.getHttpServer())
      .post("/api/v1/auth/login/passkey-options")
      .send({});
    expect(options.body.options.allowCredentials).toBeUndefined();
    const optCookies = options.get("Set-Cookie") ?? [];

    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 9 },
    } as never);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login/passkey-verify")
      .set("Cookie", optCookies)
      .send({ response: { id: credentialId } });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email.toLowerCase());
    expect((res.get("Set-Cookie") ?? []).some((c) => c.startsWith("access_token="))).toBe(true);
  });

  it("completes login without a password, entering the session directly", async () => {
    const options = await request(app.getHttpServer())
      .post("/api/v1/auth/login/passkey-options")
      .send({ email });
    const optCookies = options.get("Set-Cookie") ?? [];

    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    } as never);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login/passkey-verify")
      .set("Cookie", optCookies)
      .send({ email, response: { id: credentialId } });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email.toLowerCase());
    const sessionCookies = res.get("Set-Cookie") ?? [];
    expect(sessionCookies.some((c) => c.startsWith("access_token="))).toBe(true);
  });

  it("bypasses MFA entirely even when the account has TOTP active (regression FR-007)", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    const sessionCookies = login.get("Set-Cookie") ?? [];
    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", sessionCookies);
    await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", sessionCookies)
      .send({ code: totpCodeFor(enroll.body.secret) });

    // Password login now requires the TOTP step.
    const passwordLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
    expect(passwordLogin.body).toEqual({ mfaRequired: true });

    // Passkey login still goes straight through — no TOTP prompt, ever.
    const options = await request(app.getHttpServer())
      .post("/api/v1/auth/login/passkey-options")
      .send({ email });
    const optCookies = options.get("Set-Cookie") ?? [];
    vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 2 },
    } as never);
    const passkeyLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login/passkey-verify")
      .set("Cookie", optCookies)
      .send({ email, response: { id: credentialId } });
    expect(passkeyLogin.status).toBe(200);
    expect(passkeyLogin.body.user.email).toBe(email.toLowerCase());

    await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/disable")
      .set("Cookie", passkeyLogin.get("Set-Cookie") ?? [])
      .send({ password });
  });
});

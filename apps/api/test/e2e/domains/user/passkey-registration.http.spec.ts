import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return { ...actual, verifyRegistrationResponse: vi.fn() };
});

import { verifyRegistrationResponse } from "@simplewebauthn/server";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";

describe("Passkey registration HTTP (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_passkeyreg_${randomUUID()}@test.local`;
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
      .send({ email, password, name: "Passkey Reg", sensitiveDataConsent: true });
    cookies = res.get("Set-Cookie") ?? [];
  });

  afterAll(async () => {
    await prisma.passkey.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it("register-options returns WebAuthn options and sets the challenge cookie", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/passkeys/register-options")
      .set("Cookie", cookies);
    expect(res.status).toBe(201);
    expect(res.body.options.rp.id).toBe("localhost");
    const challengeCookies = res.get("Set-Cookie") ?? [];
    expect(challengeCookies.some((c) => c.startsWith("passkey_challenge_token="))).toBe(true);
  });

  it("register-verify creates the passkey on a verified response, and the list reflects it", async () => {
    const options = await request(app.getHttpServer())
      .post("/api/v1/auth/me/passkeys/register-options")
      .set("Cookie", cookies);
    const regCookies = options.get("Set-Cookie") ?? [];

    vi.mocked(verifyRegistrationResponse).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: `cred_${randomUUID()}`,
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      },
    } as never);

    const confirm = await request(app.getHttpServer())
      .post("/api/v1/auth/me/passkeys/register-verify")
      .set("Cookie", [...cookies, ...regCookies])
      .send({ name: "MacBook de prueba", response: {} });
    expect(confirm.status).toBe(201);
    expect(confirm.body.name).toBe("MacBook de prueba");

    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/me/passkeys")
      .set("Cookie", cookies);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe("MacBook de prueba");
    // Never exposes verification internals to the client.
    expect(list.body[0].credentialId).toBeUndefined();
    expect(list.body[0].publicKey).toBeUndefined();
  });

  it("register-verify rejects without a valid challenge cookie", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/passkeys/register-verify")
      .set("Cookie", cookies)
      .send({ name: "No challenge", response: {} });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("PASSKEY_CHALLENGE_INVALID");
  });
});

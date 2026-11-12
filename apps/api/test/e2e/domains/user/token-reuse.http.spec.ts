import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { stepUp, totpCodeFor } from "../../support/mfa";
import { randomValidRut } from "../../support/rut";

/**
 * Security run-3: a refresh token is honoured once (an old one coming back closes its session),
 * and a TOTP code is accepted once.
 */
describe("Single-use refresh tokens and TOTP codes (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const password = "Sup3rSecret!";
  const emails: string[] = [];

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
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  async function register(): Promise<{ rut: string; cookies: string[] }> {
    const email = `e2e_reuse_${randomUUID()}@test.local`;
    const rut = randomValidRut();
    emails.push(email);
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      name: "Reuse",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: rut,
    });
    expect(res.status).toBe(201);
    return { rut, cookies: res.get("Set-Cookie") ?? [] };
  }

  const refresh = (cookies: string[]) =>
    request(app.getHttpServer()).post("/api/v1/auth/refresh").set("Cookie", cookies);

  it("an already-rotated refresh token closes its session, so no copy works any more", async () => {
    const { cookies: first } = await register();
    const second = (await refresh(first)).get("Set-Cookie") ?? [];
    const third = (await refresh(second)).get("Set-Cookie") ?? [];
    expect(third.some((c) => c.startsWith("refresh_token="))).toBe(true);

    // The first token is two rotations old: someone else is using a copy.
    const stale = await refresh(first);
    expect(stale.status).toBe(401);

    // The session closed: the newest token and its access token stop working too.
    expect((await refresh(third)).status).toBe(401);
    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", third);
    expect(me.status).toBe(401);
  });

  it("two tabs refreshing with the same token at once both keep the session", async () => {
    const { cookies } = await register();
    const [a, b] = await Promise.all([refresh(cookies), refresh(cookies)]);
    expect(a.status).toBe(204);
    expect(b.status).toBe(204);
  });

  it("a TOTP code can't be used twice", async () => {
    const { cookies } = await register();
    await stepUp(app, cookies, password);
    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", cookies)
      .send({});
    const secret = enroll.body.secret as string;
    await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", cookies)
      .send({ code: await totpCodeFor(secret) })
      .expect(201);

    const code = await totpCodeFor(secret);
    const first = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", cookies)
      .send({ method: "totp", code });
    expect(first.status).toBe(200);
    const again = await request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", cookies)
      .send({ method: "totp", code });
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe("INVALID_MFA_CODE");
  });
});

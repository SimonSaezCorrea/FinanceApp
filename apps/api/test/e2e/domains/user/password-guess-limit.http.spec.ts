import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../../../src/app.module";
import { AllExceptionsFilter } from "../../../../src/infra/http/all-exceptions.filter";
import { randomValidRut } from "../../support/rut";

/**
 * Security run-3: re-entering the password from inside a session (step-up by password, change
 * password, disable MFA, delete the account) is limited — 5 wrong answers lock these checks for 15
 * minutes. Before, a stolen session could guess the password without limit and, once right, pass
 * the step-up that guards changing the email.
 *
 * Run-3 (second pass): that count is the SESSION's own, no longer login's. Sharing it let anyone who
 * knows a RUT (5 wrong logins every 15 minutes) keep the signed-in owner from changing the password;
 * and a browser that signed in before (`login_device`) answers only for its own failures, so the
 * same third party can't lock the owner out of it either.
 */
describe("Password guesses from inside a session (e2e)", { timeout: 30_000 }, () => {
  let app: INestApplication;
  const password = "Sup3rSecret!";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registered(): Promise<{ rut: string; cookies: string[] }> {
    const rut = randomValidRut();
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: `e2e_guess_${randomUUID()}@test.local`,
        password,
        name: "Guess Limit",
        sensitiveDataConsent: true,
        birthDate: "1990-01-01",
        identifierValue: rut,
      });
    expect(res.status).toBe(201);
    return { rut, cookies: res.get("Set-Cookie") ?? [] };
  }

  const stepUp = (cookies: string[], pw: string) =>
    request(app.getHttpServer())
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", cookies)
      .send({ method: "password", password: pw });

  it("locks the step-up by password after 5 wrong guesses, the right one included", async () => {
    const { rut, cookies } = await registered();

    for (let i = 0; i < 4; i++) {
      const wrong = await stepUp(cookies, `wrong-${i}`);
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
    }
    const fifth = await stepUp(cookies, "wrong-4");
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe("LOGIN_LOCKED");

    const right = await stepUp(cookies, password);
    expect(right.status).toBe(429);
    expect(right.body.error.code).toBe("LOGIN_LOCKED");

    // The session's count, not the account's: a login elsewhere is unaffected.
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    expect(login.status).toBe(200);
  });

  it("a third party's wrong logins lock unknown browsers, not the owner's session nor their browser", async () => {
    const { rut, cookies } = await registered();
    const deviceCookie = cookies.filter((c) => c.startsWith("login_device="));
    expect(deviceCookie).toHaveLength(1);

    const wrongLogin = () =>
      request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ identifierValue: rut, password: "not-it" });
    for (let i = 0; i < 4; i++) expect((await wrongLogin()).status).toBe(401);
    const fifth = await wrongLogin();
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe("LOGIN_LOCKED");

    // A browser that never signed in is locked out, the right password included…
    const stranger = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    expect(stranger.status).toBe(429);

    // …the owner's own browser is not…
    const owner = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Cookie", deviceCookie)
      .send({ identifierValue: rut, password });
    expect(owner.status).toBe(200);

    // …and neither is the owner's session asking for their password.
    const change = await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", cookies)
      .send({ currentPassword: password, newPassword: "An0therSecret!" });
    expect(change.status).toBe(204);
  });

  it("changing the password voids the device cookies issued before it", async () => {
    const { rut, cookies } = await registered();
    const oldDevice = cookies.filter((c) => c.startsWith("login_device="));
    const newPassword = "An0therSecret!";
    const change = await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", cookies)
      .send({ currentPassword: password, newPassword });
    expect(change.status).toBe(204);

    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ identifierValue: rut, password: `bad-${i}` });
    }
    const withOldCookie = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Cookie", oldDevice)
      .send({ identifierValue: rut, password: newPassword });
    expect(withOldCookie.status).toBe(429);
  });

  it("a known browser's own wrong passwords lock only that browser", async () => {
    const { rut, cookies } = await registered();
    const deviceCookie = cookies.filter((c) => c.startsWith("login_device="));
    const fromDevice = (pw: string) =>
      request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .set("Cookie", deviceCookie)
        .send({ identifierValue: rut, password: pw });
    for (let i = 0; i < 4; i++) expect((await fromDevice(`nope-${i}`)).status).toBe(401);
    expect((await fromDevice("nope-4")).status).toBe(429);
    expect((await fromDevice(password)).status).toBe(429);

    const elsewhere = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    expect(elsewhere.status).toBe(200);
  });

  it("counts wrong current passwords on change-password and stops at the lockout", async () => {
    const { cookies } = await registered();
    const change = (current: string) =>
      request(app.getHttpServer())
        .post("/api/v1/auth/me/password")
        .set("Cookie", cookies)
        .send({ currentPassword: current, newPassword: "An0therSecret!" });

    for (let i = 0; i < 4; i++) {
      expect((await change(`wrong-${i}`)).status).toBe(401);
    }
    expect((await change("wrong-4")).status).toBe(429);
    const right = await change(password);
    expect(right.status).toBe(429);
    expect(right.body.error.code).toBe("LOGIN_LOCKED");
  });

  it("a right password resets the count, so earlier misses never add up to a lockout", async () => {
    const { cookies } = await registered();
    for (let i = 0; i < 4; i++) expect((await stepUp(cookies, `wrong-${i}`)).status).toBe(401);
    expect((await stepUp(cookies, password)).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await stepUp(cookies, `again-${i}`)).status).toBe(401);
  });
});

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
 * password, disable MFA, delete the account) counts like a login attempt and shares login's
 * lockout. Before, a stolen session could guess the password without limit and, once right, pass
 * the step-up that guards changing the email.
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

  it("locks the step-up by password after 5 wrong guesses, the right one included, and login too", async () => {
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

    // One counter: switching to login buys no more attempts.
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    expect(login.status).toBe(429);
    expect(login.body.error.code).toBe("LOGIN_LOCKED");
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

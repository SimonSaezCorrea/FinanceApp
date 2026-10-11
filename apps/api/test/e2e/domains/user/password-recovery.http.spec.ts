import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import * as OTPAuth from "otpauth";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { InMemoryEmailSender } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { tokenFrom } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { appWithOutbox, lastToken, waitForEmail } from "../../support/email-outbox";
import { randomValidRut } from "../../support/rut";

function totpCodeFor(secret: string): string {
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();
}

/** E2E (specs/032 US2): recovering access by RUT. The request always answers the same; the link
 * only reaches a confirmed address; using it changes the password, closes every session and
 * still leaves the second factor in place. */
describe("Password recovery HTTP (e2e)", () => {
  let app: INestApplication;
  let outbox: InMemoryEmailSender;
  let prisma: PrismaService;
  const email = `e2e_recover_${randomUUID()}@test.local`;
  const unverifiedEmail = `e2e_recover_unverified_${randomUUID()}@test.local`;
  const rut = randomValidRut();
  const unverifiedRut = randomValidRut();
  const password = "Sup3rSecret!";
  const newPassword = "Nuev4Clave!x";
  let cookies: string[] = [];
  let mfaSecret = "";

  const register = (address: string, identifierValue: string) =>
    request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: address,
      password,
      name: "Recovery E2E",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue,
    });

  const forgot = (identifierValue: string) =>
    request(app.getHttpServer()).post("/api/v1/auth/password/forgot").send({ identifierValue });

  beforeAll(async () => {
    ({ app, outbox } = await appWithOutbox());
    prisma = app.get(PrismaService);

    const registered = await register(email, rut);
    cookies = registered.get("Set-Cookie") ?? [];
    await request(app.getHttpServer())
      .post("/api/v1/auth/email/verify")
      .send({ token: lastToken(outbox, email, "verify-email") });

    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", cookies);
    mfaSecret = enroll.body.secret;
    await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", cookies)
      .send({ code: totpCodeFor(mfaSecret) });

    await register(unverifiedEmail, unverifiedRut);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [email, unverifiedEmail] } } });
    await app.close();
  });

  it("answers the same for an existing, a missing and an unconfirmed RUT", async () => {
    const responses = await Promise.all([
      forgot(rut),
      forgot(randomValidRut()),
      forgot(unverifiedRut),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(202);
      expect(res.body).toEqual({});
    }

    await waitForEmail(outbox, email, "reset-password");
    // Give the background work for the other two the same chance before asserting nothing left.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(outbox.last(unverifiedEmail, "reset-password")).toBeUndefined();
  });

  it("the RUT may be typed with dots and dash", async () => {
    const formatted = `${rut.slice(0, -1)}-${rut.slice(-1)}`;
    const res = await forgot(formatted);
    expect(res.status).toBe(202);
  });

  it("a weak new password is refused and the token survives", async () => {
    const email_ = outbox.last(email, "reset-password");
    const token = tokenFrom(email_!)!;
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/password/reset")
      .send({ token, newPassword: "short" });
    expect(res.status).toBe(400);
  });

  it("the link changes the password once, closes every session and keeps the second factor", async () => {
    const token = lastToken(outbox, email, "reset-password");
    const reset = await request(app.getHttpServer())
      .post("/api/v1/auth/password/reset")
      .send({ token, newPassword });
    expect(reset.status).toBe(200);
    expect(reset.get("Set-Cookie") ?? []).toEqual([]);

    const again = await request(app.getHttpServer())
      .post("/api/v1/auth/password/reset")
      .send({ token, newPassword: "Otr4Clave!yy" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("EMAIL_TOKEN_INVALID");

    // The session opened at registration is gone.
    const me = await request(app.getHttpServer()).get("/api/v1/auth/me").set("Cookie", cookies);
    expect(me.status).toBe(401);
    const refresh = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookies);
    expect(refresh.status).toBe(401);

    const oldLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifierValue: rut, password: newPassword });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body).toEqual({ mfaRequired: true });

    await waitForEmail(outbox, email, "security-notice", "Recuperaste el acceso");
  });

  it("an unknown token is refused", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/password/reset")
      .send({ token: "A".repeat(43), newPassword });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("EMAIL_TOKEN_INVALID");
  });
});

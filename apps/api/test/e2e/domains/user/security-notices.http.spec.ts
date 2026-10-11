import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import * as OTPAuth from "otpauth";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { InMemoryEmailSender } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { appWithOutbox, lastToken, waitForEmail } from "../../support/email-outbox";
import { randomValidRut } from "../../support/rut";

function totpCodeFor(secret: string): string {
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();
}

/** E2E (specs/032 US3): every sensitive change sends a notice to the confirmed address, a
 * failing email never changes the action's answer, and an unconfirmed address gets nothing. */
describe("Security notices HTTP (e2e)", () => {
  let app: INestApplication;
  let outbox: InMemoryEmailSender;
  let prisma: PrismaService;
  const email = `e2e_notices_${randomUUID()}@test.local`;
  const unverifiedEmail = `e2e_notices_unverified_${randomUUID()}@test.local`;
  const rut = randomValidRut();
  const password = "Sup3rSecret!";
  const newPassword = "Nuev4Clave!x";
  let cookies: string[] = [];

  const register = (address: string, identifierValue: string) =>
    request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email: address,
      password,
      name: "Notices E2E",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue,
    });

  beforeAll(async () => {
    ({ app, outbox } = await appWithOutbox());
    prisma = app.get(PrismaService);
    const registered = await register(email, rut);
    cookies = registered.get("Set-Cookie") ?? [];
    await request(app.getHttpServer())
      .post("/api/v1/auth/email/verify")
      .send({ token: lastToken(outbox, email, "verify-email") });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [email, unverifiedEmail] } } });
    await app.close();
  });

  it("changing the password sends a notice, even when the email itself fails", async () => {
    outbox.failNext = true;
    const failed = await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", cookies)
      .send({ currentPassword: password, newPassword });
    expect(failed.status).toBe(204);

    const back = await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", cookies)
      .send({ currentPassword: newPassword, newPassword: password });
    expect(back.status).toBe(204);
    await waitForEmail(outbox, email, "security-notice", "Cambió la contraseña");
  });

  it("turning the second factor on and off sends one notice each", async () => {
    const enroll = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", cookies);
    await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", cookies)
      .send({ code: totpCodeFor(enroll.body.secret) });
    await waitForEmail(outbox, email, "security-notice", "Activaste la verificación");

    const disabled = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/disable")
      .set("Cookie", cookies)
      .send({ password });
    expect(disabled.status).toBe(204);
    await waitForEmail(outbox, email, "security-notice", "Se desactivó la verificación");
  });

  it("an unconfirmed address gets no notice", async () => {
    const registered = await register(unverifiedEmail, randomValidRut());
    const own = registered.get("Set-Cookie") ?? [];
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", own)
      .send({ currentPassword: password, newPassword });
    expect(res.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(outbox.last(unverifiedEmail, "security-notice")).toBeUndefined();
  });

  it("deleting the account sends its notice to the address it had", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/me/delete-account")
      .set("Cookie", cookies)
      .send({ password, keepHistory: false });
    expect(res.status).toBe(204);
    await waitForEmail(outbox, email, "security-notice", "Eliminaste tu cuenta");
  });
});

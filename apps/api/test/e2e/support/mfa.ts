import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import * as OTPAuth from "otpauth";
import request from "supertest";

import type { InMemoryEmailSender } from "../../../src/infra/email/senders/in-memory-email.sender";
import { lastToken } from "./email-outbox";
import { randomValidRut } from "./rut";

/** E2E helpers for the second factor (specs/021, specs/040). */

export const PASSWORD = "Sup3rSecret!";

export function totpCodeFor(secret: string): string {
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();
}

export interface TestAccount {
  email: string;
  rut: string;
  cookies: string[];
}

/** Registers an account and confirms its email through the outbox link. */
export async function registerConfirmed(
  app: INestApplication,
  outbox: InMemoryEmailSender,
  prefix: string,
): Promise<TestAccount> {
  const email = `e2e_${prefix}_${randomUUID()}@test.local`;
  const rut = randomValidRut();
  const registered = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
    email,
    password: PASSWORD,
    name: "MFA E2E",
    sensitiveDataConsent: true,
    birthDate: "1990-01-01",
    identifierValue: rut,
  });
  await request(app.getHttpServer())
    .post("/api/v1/auth/email/verify")
    .send({ token: lastToken(outbox, email, "verify-email") });
  return { email, rut, cookies: registered.get("Set-Cookie") ?? [] };
}

/** Turns on the authenticator app; returns its secret and the 10 recovery codes. */
export async function enableTotp(
  app: INestApplication,
  cookies: string[],
): Promise<{ secret: string; recoveryCodes: string[] }> {
  const enroll = await request(app.getHttpServer())
    .post("/api/v1/auth/me/mfa/enroll")
    .set("Cookie", cookies)
    .send({ method: "totp" });
  const secret = enroll.body.secret as string;
  const confirm = await request(app.getHttpServer())
    .post("/api/v1/auth/me/mfa/confirm")
    .set("Cookie", cookies)
    .send({ code: totpCodeFor(secret) });
  return { secret, recoveryCodes: confirm.body.recoveryCodes as string[] };
}

/** RUT + password; returns the login response and the cookies it set (pending or session). */
export async function login(
  app: INestApplication,
  rut: string,
  extraCookies: string[] = [],
): Promise<{ body: Record<string, unknown>; cookies: string[] }> {
  const res = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .set("Cookie", extraCookies)
    .send({ identifierValue: rut, password: PASSWORD });
  return { body: res.body, cookies: res.get("Set-Cookie") ?? [] };
}

/** Completes a pending login's second factor; returns the response and its cookies. */
export async function verifyMfa(
  app: INestApplication,
  pendingCookies: string[],
  code: string,
  rememberDevice = false,
): Promise<{ status: number; body: Record<string, unknown>; cookies: string[] }> {
  const res = await request(app.getHttpServer())
    .post("/api/v1/auth/login/mfa-verify")
    .set("Cookie", pendingCookies)
    .send({ code, rememberDevice });
  return { status: res.status, body: res.body, cookies: res.get("Set-Cookie") ?? [] };
}

/** Steps up the current session with the authenticator app. */
export async function stepUpTotp(app: INestApplication, cookies: string[], secret: string) {
  return request(app.getHttpServer())
    .post("/api/v1/auth/sessions/step-up")
    .set("Cookie", cookies)
    .send({ method: "totp", code: totpCodeFor(secret) });
}

/** The cookie pairs ("name=value") of a Set-Cookie list, ready for `.set("Cookie", …)`. */
export function cookiePairs(setCookie: string[]): string[] {
  return setCookie.map((c) => c.split(";")[0]!);
}

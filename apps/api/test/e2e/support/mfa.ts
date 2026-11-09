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

/**
 * A password step-up of `cookies`' session, which adding a passkey or a second factor needs
 * (GHSA-jhp2-jfjr-fqfq). Allowed only while the account has no other factor; once it has one,
 * the test steps up with that factor instead (a step-up stays valid for its window, so a
 * refused call here leaves an earlier one in place).
 */
export async function stepUp(
  app: INestApplication,
  cookies: string[],
  password: string = PASSWORD,
): Promise<void> {
  await request(app.getHttpServer())
    .post("/api/v1/auth/sessions/step-up")
    .set("Cookie", cookies)
    .send({ method: "password", password });
}

/**
 * Clears every step-up of the account's sessions, so a test can check a gate "without a recent
 * step-up" after a setup that needed one to enrol the factor.
 */
export async function forgetStepUp(
  prisma: { session: { updateMany(args: unknown): Promise<unknown> } },
  email: string,
): Promise<void> {
  await prisma.session.updateMany({ where: { user: { email } }, data: { stepUpAt: null } });
}

/** Turns on the authenticator app; returns its secret and the 10 recovery codes. */
export async function enableTotp(
  app: INestApplication,
  cookies: string[],
): Promise<{ secret: string; recoveryCodes: string[] }> {
  await stepUp(app, cookies);
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
export async function stepUpTotp(
  app: INestApplication,
  cookies: string[],
  secret: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  // Named type, not supertest's inferred one: TS can't name superagent's `Response` from here
  // (TS2883 in CI, where pnpm lays out @types/superagent differently).
  const res = await request(app.getHttpServer())
    .post("/api/v1/auth/sessions/step-up")
    .set("Cookie", cookies)
    .send({ method: "totp", code: totpCodeFor(secret) });
  return { status: res.status, body: res.body };
}

/** The cookie pairs ("name=value") of a Set-Cookie list, ready for `.set("Cookie", …)`. */
export function cookiePairs(setCookie: string[]): string[] {
  return setCookie.map((c) => c.split(";")[0]!);
}

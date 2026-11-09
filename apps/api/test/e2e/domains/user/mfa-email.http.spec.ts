import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { InMemoryEmailSender } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { appWithOutbox, waitForEmail } from "../../support/email-outbox";
import {
  PASSWORD,
  cookiePairs,
  login,
  registerConfirmed,
  totpCodeFor,
  verifyMfa,
  type TestAccount,
  stepUp,
  forgetStepUp,
} from "../../support/mfa";
import { randomValidRut } from "../../support/rut";

/** E2E (specs/040 US3): the second factor by a code sent to the confirmed email. */
describe("Email second factor HTTP (e2e)", () => {
  let app: INestApplication;
  let outbox: InMemoryEmailSender;
  let prisma: PrismaService;
  let a: TestAccount;
  let b: TestAccount;
  let recoveryA: string[];

  const http = () => request(app.getHttpServer());

  /** The code of the last second-factor email sent to `to`. */
  function lastCode(to: string): string {
    const email = outbox.last(to, "mfa-code");
    const code = email?.text.match(/^(\d{6})$/m)?.[1];
    if (!code) throw new Error(`No code emailed to ${to}`);
    return code;
  }

  /** Lets the next code of an account go out now (the one-a-minute limit). */
  async function ageCodes(email: string) {
    await prisma.mfaCode.updateMany({
      where: { user: { email } },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60_000) },
    });
  }

  async function enableEmail(account: TestAccount): Promise<string[]> {
    await stepUp(app, account.cookies);
    const enroll = await http()
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", account.cookies)
      .send({ method: "email" });
    expect(enroll.body).toEqual({ method: "email", codeSent: true });
    const confirm = await http()
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", account.cookies)
      .send({ code: lastCode(account.email) });
    expect(confirm.body.recoveryCodes).toHaveLength(10);
    return confirm.body.recoveryCodes as string[];
  }

  beforeAll(async () => {
    ({ app, outbox } = await appWithOutbox());
    prisma = app.get(PrismaService);
    a = await registerConfirmed(app, outbox, "mfa_email_a");
    b = await registerConfirmed(app, outbox, "mfa_email_b");
    recoveryA = await enableEmail(a);
    await enableEmail(b);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [a.email, b.email] } } });
    await app.close();
  });

  it("activates with the code sent to the confirmed email, and says so in /me", async () => {
    const me = await http().get("/api/v1/auth/me").set("Cookie", a.cookies);
    expect(me.body).toMatchObject({ mfaEnabled: true, mfaMethod: "email" });
    await waitForEmail(outbox, a.email, "security-notice");
  });

  it("refuses email codes for an address that isn't confirmed", async () => {
    const email = `e2e_mfa_unverified_${randomUUID()}@test.local`;
    const registered = await http().post("/api/v1/auth/register").send({
      email,
      password: PASSWORD,
      name: "Sin confirmar",
      sensitiveDataConsent: true,
      birthDate: "1990-01-01",
      identifierValue: randomValidRut(),
    });
    await stepUp(app, registered.get("Set-Cookie") ?? []);
    const res = await http()
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", registered.get("Set-Cookie") ?? [])
      .send({ method: "email" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("MFA_EMAIL_NOT_VERIFIED");
    await prisma.user.deleteMany({ where: { email } });
  });

  it("signs in with the emailed code; the email names no amount and is in the account's language", async () => {
    await ageCodes(a.email);
    const pending = await login(app, a.rut);
    expect(pending.body).toMatchObject({ mfaRequired: true, mfaMethod: "email", codeSent: true });
    const email = outbox.last(a.email, "mfa-code")!;
    expect(email.locale).toBe("es");
    expect(email.subject).toContain("entrar");
    expect(email.text).not.toMatch(/\$|CLP|USD/);

    const ok = await verifyMfa(app, pending.cookies, lastCode(a.email));
    expect(ok.status).toBe(200);
  });

  it("limits resends, and a resent code replaces the previous one", async () => {
    await ageCodes(a.email);
    const pending = await login(app, a.rut);
    const firstCode = lastCode(a.email);

    const tooSoon = await http()
      .post("/api/v1/auth/login/mfa-resend")
      .set("Cookie", pending.cookies);
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error.code).toBe("MFA_CODE_RATE_LIMITED");
    expect(tooSoon.body.error.details.retryAfterSeconds).toBeGreaterThan(0);

    await ageCodes(a.email);
    const resent = await http()
      .post("/api/v1/auth/login/mfa-resend")
      .set("Cookie", pending.cookies);
    expect(resent.status).toBe(200);
    const secondCode = lastCode(a.email);

    if (firstCode !== secondCode) {
      expect((await verifyMfa(app, pending.cookies, firstCode)).status).toBe(401);
    }
    expect((await verifyMfa(app, pending.cookies, secondCode)).status).toBe(200);
  });

  it("a recovery code still works with the email method", async () => {
    await ageCodes(a.email);
    const pending = await login(app, a.rut);
    expect((await verifyMfa(app, pending.cookies, recoveryA[0]!)).status).toBe(200);
  });

  it("steps up with an emailed code, never with a recovery code", async () => {
    const sent = await http()
      .post("/api/v1/auth/sessions/step-up/email-code")
      .set("Cookie", a.cookies);
    expect(sent.status).toBe(200);
    const recovery = await http()
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", a.cookies)
      .send({ method: "email", code: recoveryA[1] });
    expect(recovery.status).toBe(400);
    const ok = await http()
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", a.cookies)
      .send({ method: "email", code: lastCode(a.email) });
    expect(ok.status).toBe(200);
  });

  it("changes to the app after a step-up, keeping the recovery codes", async () => {
    await forgetStepUp(prisma, b.email);
    const without = await http()
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", b.cookies)
      .send({ method: "totp" });
    expect(without.status).toBe(403);
    expect(without.body.error.code).toBe("STEP_UP_REQUIRED");

    const same = await http()
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", b.cookies)
      .send({ method: "email" });
    expect(same.body.error.code).toBe("MFA_SAME_METHOD");

    await ageCodes(b.email);
    await http().post("/api/v1/auth/sessions/step-up/email-code").set("Cookie", b.cookies);
    await http()
      .post("/api/v1/auth/sessions/step-up")
      .set("Cookie", b.cookies)
      .send({ method: "email", code: lastCode(b.email) })
      .expect(200);

    const enroll = await http()
      .post("/api/v1/auth/me/mfa/enroll")
      .set("Cookie", b.cookies)
      .send({ method: "totp" });
    const secret = enroll.body.secret as string;
    const confirm = await http()
      .post("/api/v1/auth/me/mfa/confirm")
      .set("Cookie", b.cookies)
      .send({ code: totpCodeFor(secret) });
    expect(confirm.body.recoveryCodes).toBeNull();

    const me = await http().get("/api/v1/auth/me").set("Cookie", b.cookies);
    expect(me.body).toMatchObject({ mfaMethod: "totp", mfaRecoveryCodesRemaining: 10 });
    await waitForEmail(outbox, b.email, "security-notice", "Cambiaste");

    const pending = await login(app, b.rut);
    expect(pending.body).toMatchObject({ mfaRequired: true, mfaMethod: "totp" });
    expect((await verifyMfa(app, pending.cookies, totpCodeFor(secret))).status).toBe(200);
  });

  it("locks after 5 wrong emailed codes", async () => {
    await ageCodes(a.email);
    const pending = await login(app, a.rut);
    const cookies = cookiePairs(pending.cookies);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await verifyMfa(app, cookies, "000000")).status);
    }
    expect(statuses.slice(0, 4).every((s) => s === 401)).toBe(true);
    expect(statuses[4]).toBe(429);
    expect((await verifyMfa(app, cookies, lastCode(a.email))).status).toBe(429);
  });
});

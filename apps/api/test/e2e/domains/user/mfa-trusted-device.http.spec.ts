import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { InMemoryEmailSender } from "../../../../src/infra/email/senders/in-memory-email.sender";
import { PrismaService } from "../../../../src/infra/prisma/prisma.service";
import { appWithOutbox, lastToken, waitForEmail } from "../../support/email-outbox";
import {
  PASSWORD,
  cookiePairs,
  enableTotp,
  login,
  registerConfirmed,
  stepUpTotp,
  totpCodeFor,
  verifyMfa,
  type TestAccount,
} from "../../support/mfa";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36";

/** E2E (specs/040 US2): "Recordar este dispositivo". */
describe("Remembered device HTTP (e2e)", () => {
  let app: INestApplication;
  let outbox: InMemoryEmailSender;
  let prisma: PrismaService;
  let a: TestAccount;
  let b: TestAccount;
  let secretA: string;
  let secretB: string;
  let passwordA = PASSWORD;

  const trustedCookie = (setCookie: string[]) =>
    cookiePairs(setCookie).filter((c) => c.startsWith("mfa_trusted="));

  const loginWith = (rut: string, password: string, cookies: string[] = []) =>
    request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Cookie", cookies)
      .send({ identifierValue: rut, password });

  /** Signs in with the app's code and "remember", returning the session and trusted cookies. */
  async function rememberDevice(account: TestAccount, secret: string, password = PASSWORD) {
    const pending = await loginWith(account.rut, password);
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login/mfa-verify")
      .set("Cookie", pending.get("Set-Cookie") ?? [])
      .set("User-Agent", UA)
      .send({ code: totpCodeFor(secret), rememberDevice: true });
    expect(res.status).toBe(200);
    const setCookie = res.get("Set-Cookie") ?? [];
    return { session: cookiePairs(setCookie), trusted: trustedCookie(setCookie) };
  }

  beforeAll(async () => {
    ({ app, outbox } = await appWithOutbox());
    prisma = app.get(PrismaService);
    a = await registerConfirmed(app, outbox, "trusted_a");
    b = await registerConfirmed(app, outbox, "trusted_b");
    ({ secret: secretA } = await enableTotp(app, a.cookies));
    ({ secret: secretB } = await enableTotp(app, b.cookies));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [a.email, b.email] } } });
    await app.close();
  });

  it("skips only the second factor on the remembered browser, for its own account", async () => {
    const { trusted, session } = await rememberDevice(a, secretA);
    expect(trusted).toHaveLength(1);
    await waitForEmail(outbox, a.email, "security-notice", "Recordaste un dispositivo");

    expect((await login(app, a.rut, trusted)).body.mfaRequired).toBe(false);
    expect((await loginWith(a.rut, `${PASSWORD}x`, trusted)).status).toBe(401);
    // Another account in the same browser is still asked for its second factor.
    expect((await login(app, b.rut, trusted)).body.mfaRequired).toBe(true);

    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/me/mfa/trusted-devices")
      .set("Cookie", [...session, ...trusted]);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ deviceLabel: "Chrome · Windows", isCurrent: true });
  });

  it("asks again once the device is removed; removing it twice is a 404", async () => {
    const { trusted, session } = await rememberDevice(a, secretA);
    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/me/mfa/trusted-devices")
      .set("Cookie", [...session, ...trusted]);
    const current = list.body.items.find((d: { isCurrent: boolean }) => d.isCurrent);

    const remove = () =>
      request(app.getHttpServer())
        .delete(`/api/v1/auth/me/mfa/trusted-devices/${current.id}`)
        .set("Cookie", session);
    expect((await remove()).status).toBe(204);
    expect((await remove()).status).toBe(404);
    expect((await login(app, a.rut, trusted)).body.mfaRequired).toBe(true);
  });

  it("does not let another account remove it", async () => {
    const mine = await rememberDevice(a, secretA);
    const theirs = await rememberDevice(b, secretB);
    const list = await request(app.getHttpServer())
      .get("/api/v1/auth/me/mfa/trusted-devices")
      .set("Cookie", [...mine.session, ...mine.trusted]);
    const id = list.body.items.find((d: { isCurrent: boolean }) => d.isCurrent).id;
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/auth/me/mfa/trusted-devices/${id}`)
      .set("Cookie", theirs.session);
    expect(res.status).toBe(404);
  });

  it("forgets every device when the password changes", async () => {
    const { trusted, session } = await rememberDevice(a, secretA, passwordA);
    const changed = await request(app.getHttpServer())
      .post("/api/v1/auth/me/password")
      .set("Cookie", session)
      .send({ currentPassword: passwordA, newPassword: `${passwordA}2` });
    expect(changed.status).toBe(204);
    passwordA = `${passwordA}2`;
    expect((await loginWith(a.rut, passwordA, trusted)).body.mfaRequired).toBe(true);
  });

  it("forgets every device when the recovery codes are regenerated or MFA is disabled", async () => {
    const first = await rememberDevice(b, secretB);
    expect((await stepUpTotp(app, first.session, secretB)).status).toBe(200);
    const regen = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/recovery-codes")
      .set("Cookie", first.session);
    expect(regen.status).toBe(201);
    expect((await login(app, b.rut, first.trusted)).body.mfaRequired).toBe(true);

    const second = await rememberDevice(b, secretB);
    expect((await stepUpTotp(app, second.session, secretB)).status).toBe(200);
    const off = await request(app.getHttpServer())
      .post("/api/v1/auth/me/mfa/disable")
      .set("Cookie", second.session)
      .send({ password: PASSWORD });
    expect(off.status).toBe(204);
    expect(await prisma.trustedDevice.count({ where: { user: { email: b.email } } })).toBe(0);
  });

  it("stops skipping the second factor once its 30 days are over", async () => {
    const { trusted } = await rememberDevice(a, secretA, passwordA);
    expect((await loginWith(a.rut, passwordA, trusted)).body.mfaRequired).toBe(false);
    await prisma.trustedDevice.updateMany({
      where: { user: { email: a.email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await loginWith(a.rut, passwordA, trusted)).body.mfaRequired).toBe(true);
  });

  it("forgets every device when the password is recovered by email", async () => {
    const { trusted } = await rememberDevice(a, secretA, passwordA);
    await request(app.getHttpServer())
      .post("/api/v1/auth/password/forgot")
      .send({ identifierValue: a.rut });
    await waitForEmail(outbox, a.email, "reset-password");
    const reset = await request(app.getHttpServer())
      .post("/api/v1/auth/password/reset")
      .send({ token: lastToken(outbox, a.email, "reset-password"), newPassword: `${passwordA}3` });
    expect(reset.status).toBe(200);
    passwordA = `${passwordA}3`;
    expect((await loginWith(a.rut, passwordA, trusted)).body.mfaRequired).toBe(true);
  });

  it("a login with the code only (no remember) sets no trusted cookie", async () => {
    const fresh = await loginWith(a.rut, passwordA);
    const verified = await verifyMfa(app, fresh.get("Set-Cookie") ?? [], totpCodeFor(secretA));
    expect(trustedCookie(verified.cookies)).toHaveLength(0);
  });
});
